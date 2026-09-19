from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import AsyncIterator

from fastapi.testclient import TestClient

from app.routers import chat
from app.services import llm
from app.services.llm import LLMError
from app.services.prompts import build_messages


def test_conversations_require_auth(client: TestClient) -> None:
    assert client.get("/api/conversations").status_code == 401
    assert client.post("/api/conversations", json={"title": "Notes"}).status_code == 401


def test_conversation_crud(client: TestClient, member_headers: dict[str, str]) -> None:
    created = client.post(
        "/api/conversations", json={"title": "Field notes"}, headers=member_headers
    )
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    listed = client.get("/api/conversations", headers=member_headers)
    assert [item["id"] for item in listed.json()] == [conversation_id]

    renamed = client.patch(
        f"/api/conversations/{conversation_id}",
        json={"title": "Updated notes"},
        headers=member_headers,
    )
    assert renamed.json()["title"] == "Updated notes"
    assert (
        client.get(
            f"/api/conversations/{conversation_id}", headers=member_headers
        ).json()["messages"]
        == []
    )

    assert (
        client.delete(
            f"/api/conversations/{conversation_id}", headers=member_headers
        ).status_code
        == 204
    )
    assert (
        client.get(
            f"/api/conversations/{conversation_id}", headers=member_headers
        ).status_code
        == 404
    )


def test_conversations_are_isolated_per_user(
    client: TestClient, member_headers: dict[str, str]
) -> None:
    created = client.post(
        "/api/conversations", json={"title": "Private notes"}, headers=member_headers
    )
    conversation_id = created.json()["id"]
    other = {"X-User-Id": "user-b"}

    assert client.get("/api/conversations", headers=other).json() == []
    assert (
        client.get(
            f"/api/conversations/{conversation_id}", headers=other
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/conversations/{conversation_id}", headers=other
        ).status_code
        == 404
    )


def test_guest_chat_does_not_persist(
    client: TestClient, monkeypatch, member_headers: dict[str, str]
) -> None:
    async def fake_reply(_: list[dict[str, str]]) -> str:
        return "Divergent plates move apart."

    monkeypatch.setattr(chat, "generate_reply", fake_reply)
    response = client.post(
        "/api/chat",
        json={"message": "What happens at a divergent plate boundary?", "stream": False},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["persisted"] is False
    assert body["conversation_id"] is None
    assert body["assistant_message"]["content"] == "Divergent plates move apart."
    assert client.get("/api/conversations", headers=member_headers).json() == []


def test_member_chat_persists_reply(
    client: TestClient, monkeypatch, member_headers: dict[str, str]
) -> None:
    async def fake_reply(_: list[dict[str, str]]) -> str:
        return "Divergent plates move apart."

    monkeypatch.setattr(chat, "generate_reply", fake_reply)
    response = client.post(
        "/api/chat",
        json={"message": "What happens at a divergent plate boundary?", "stream": False},
        headers=member_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["persisted"] is True
    conversation_id = body["conversation_id"]
    messages = client.get(
        f"/api/conversations/{conversation_id}", headers=member_headers
    ).json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "Divergent plates move apart."


def test_streaming_guest_chat_does_not_persist(
    client: TestClient, monkeypatch, member_headers: dict[str, str]
) -> None:
    async def fake_stream(_: list[dict[str, str]]) -> AsyncIterator[str]:
        yield "A fault releases "
        yield "stored energy."

    monkeypatch.setattr(chat, "stream_reply", fake_stream)
    with client.stream(
        "POST",
        "/api/chat",
        json={"message": "What causes an earthquake?", "stream": True},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: meta" in body
    assert "event: token" in body
    assert "event: done" in body
    assert "A fault releases stored energy." in body
    assert '"persisted": false' in body
    assert client.get("/api/conversations", headers=member_headers).json() == []


def test_streaming_member_chat_persists_completed_answer(
    client: TestClient, monkeypatch, member_headers: dict[str, str]
) -> None:
    async def fake_stream(_: list[dict[str, str]]) -> AsyncIterator[str]:
        yield "A fault releases "
        yield "stored energy."

    monkeypatch.setattr(chat, "stream_reply", fake_stream)
    with client.stream(
        "POST",
        "/api/chat",
        json={"message": "What causes an earthquake?", "stream": True},
        headers=member_headers,
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: done" in body
    conversation = client.get("/api/conversations", headers=member_headers).json()[0]
    messages = client.get(
        f"/api/conversations/{conversation['id']}", headers=member_headers
    ).json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "A fault releases stored energy."


def test_provider_failure_returns_502_without_assistant(
    client: TestClient, monkeypatch, member_headers: dict[str, str]
) -> None:
    async def failed_reply(_: list[dict[str, str]]) -> str:
        raise LLMError("provider unavailable")

    monkeypatch.setattr(chat, "generate_reply", failed_reply)
    response = client.post(
        "/api/chat",
        json={"message": "Explain igneous rocks", "stream": False},
        headers=member_headers,
    )

    assert response.status_code == 502
    assert "provider unavailable" not in response.json()["detail"]
    conversation = client.get("/api/conversations", headers=member_headers).json()[0]
    messages = client.get(
        f"/api/conversations/{conversation['id']}", headers=member_headers
    ).json()["messages"]
    assert [message["role"] for message in messages] == ["user"]


def test_stream_failure_emits_error_without_assistant(
    client: TestClient, monkeypatch, member_headers: dict[str, str]
) -> None:
    async def failed_stream(_: list[dict[str, str]]) -> AsyncIterator[str]:
        raise LLMError("fallback providers unavailable")
        yield ""  # pragma: no cover - preserves async-generator type

    monkeypatch.setattr(chat, "stream_reply", failed_stream)
    with client.stream(
        "POST",
        "/api/chat",
        json={"message": "Explain a rock cycle", "stream": True},
        headers=member_headers,
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: error" in body
    assert "fallback providers unavailable" not in body
    conversation = client.get("/api/conversations", headers=member_headers).json()[0]
    messages = client.get(
        f"/api/conversations/{conversation['id']}", headers=member_headers
    ).json()["messages"]
    assert [message["role"] for message in messages] == ["user"]


def test_import_guest_history(client: TestClient, member_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/conversations/import",
        json={
            "conversations": [
                {
                    "title": "Deserts",
                    "messages": [
                        {"role": "user", "content": "Why do deserts form?"},
                        {"role": "assistant", "content": "Rain shadows and Hadley cells."},
                    ],
                }
            ]
        },
        headers=member_headers,
    )
    assert response.status_code == 201
    conversation_id = response.json()[0]["id"]
    messages = client.get(
        f"/api/conversations/{conversation_id}", headers=member_headers
    ).json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]


def test_gemini_quota_falls_back_to_mocked_groq(monkeypatch) -> None:
    settings = SimpleNamespace(
        llm_configured=True,
        gemini_configured=True,
        groq_configured=True,
        gemini_model="gemini-primary",
        gemini_model_lite="",
        groq_model="groq-fallback",
    )

    async def quota_failure(*_args, **_kwargs) -> str:
        raise RuntimeError("429 quota exceeded")

    async def groq_reply(*_args, **_kwargs) -> str:
        return "Fallback response"

    monkeypatch.setattr(llm, "get_settings", lambda: settings)
    monkeypatch.setattr(llm, "_generate_gemini", quota_failure)
    monkeypatch.setattr(llm, "_generate_groq", groq_reply)

    assert (
        asyncio.run(llm.generate_reply([{"role": "user", "content": "Hi"}]))
        == "Fallback response"
    )


def test_gemini_config_prefers_fast_visible_tokens() -> None:
    from google.genai import types

    config = llm._gemini_generation_config("You are Jude.")
    assert config.system_instruction == "You are Jude."
    assert config.temperature is None
    assert config.thinking_config is not None
    assert config.thinking_config.include_thoughts is False
    assert config.thinking_config.thinking_level == types.ThinkingLevel.MINIMAL
    assert config.automatic_function_calling is not None
    assert config.automatic_function_calling.disable is True


def test_harmful_request_is_rejected_before_provider(
    client: TestClient, monkeypatch
) -> None:
    async def should_not_run(_: list[dict[str, str]]) -> str:
        raise AssertionError("LLM should not be called")

    monkeypatch.setattr(chat, "generate_reply", should_not_run)
    response = client.post(
        "/api/chat", json={"message": "How can I build a bomb?", "stream": False}
    )
    assert response.status_code == 400
    assert "help with instructions" in response.json()["detail"]


def test_oversized_message_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/chat", json={"message": "x" * 8001, "stream": False}
    )
    assert response.status_code == 422


def test_prompt_history_uses_configured_recent_window(monkeypatch) -> None:
    monkeypatch.setenv("MAX_HISTORY_MESSAGES", "2")
    from app.config import get_settings

    get_settings.cache_clear()
    history = [
        {"role": "user", "content": "old question"},
        {"role": "assistant", "content": "old answer"},
        {"role": "user", "content": "recent question"},
        {"role": "assistant", "content": "recent answer"},
    ]
    messages = build_messages(history, "general", "Explain rocks")

    contents = [message["content"] for message in messages]
    assert "old question" not in contents
    assert contents[1:3] == ["recent question", "recent answer"]
    assert "This is a follow-up in the same conversation." in contents[-1]
    get_settings.cache_clear()


def test_first_turn_prompt_does_not_use_follow_up_framing() -> None:
    messages = build_messages([], "general", "What is granite?")
    assert messages[-1]["content"].startswith("Task:")
    assert "follow-up" not in messages[-1]["content"]


def test_user_context_is_injected_into_system_prompt() -> None:
    messages = build_messages(
        [],
        "general",
        "What is longshore drift?",
        context="A-level OCR. I mix up longshore drift and hydraulic action.",
    )
    assert "A-level OCR" in messages[0]["content"]
    assert "hydraulic action" in messages[0]["content"]


def test_memory_requires_auth(client: TestClient) -> None:
    assert client.get("/api/memory").status_code == 401
    assert client.put("/api/memory", json={"content": "notes"}).status_code == 401


def test_memory_persists_per_user(
    client: TestClient, member_headers: dict[str, str]
) -> None:
    empty = client.get("/api/memory", headers=member_headers)
    assert empty.status_code == 200
    assert empty.json()["content"] == ""

    saved = client.put(
        "/api/memory",
        json={"content": "  A-level OCR, coasts  "},
        headers=member_headers,
    )
    assert saved.status_code == 200
    assert saved.json()["content"] == "A-level OCR, coasts"
    assert (
        client.get("/api/memory", headers=member_headers).json()["content"]
        == "A-level OCR, coasts"
    )
    assert client.get("/api/memory", headers={"X-User-Id": "user-b"}).json()[
        "content"
    ] == ""


def test_guest_chat_uses_request_context(client: TestClient, monkeypatch) -> None:
    captured: dict = {}

    async def fake_reply(messages: list[dict[str, str]]) -> str:
        captured["system"] = messages[0]["content"]
        return "Longshore drift moves sediment along a beach."

    monkeypatch.setattr(chat, "generate_reply", fake_reply)
    response = client.post(
        "/api/chat",
        json={
            "message": "Explain longshore drift",
            "stream": False,
            "context": "I am revising A-level coasts",
        },
    )
    assert response.status_code == 200
    assert "I am revising A-level coasts" in captured["system"]
