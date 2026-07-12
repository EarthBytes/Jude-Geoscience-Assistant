from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import AsyncIterator

from fastapi.testclient import TestClient

from app.routers import chat
from app.services import llm
from app.services.llm import LLMError
from app.services.prompts import build_messages


def test_conversation_crud(client: TestClient) -> None:
    created = client.post("/api/conversations", json={"title": "Field notes"})
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    listed = client.get("/api/conversations")
    assert [item["id"] for item in listed.json()] == [conversation_id]

    renamed = client.patch(
        f"/api/conversations/{conversation_id}", json={"title": "Updated notes"}
    )
    assert renamed.json()["title"] == "Updated notes"
    assert client.get(f"/api/conversations/{conversation_id}").json()["messages"] == []

    assert client.delete(f"/api/conversations/{conversation_id}").status_code == 204
    assert client.get(f"/api/conversations/{conversation_id}").status_code == 404


def test_buffered_chat_returns_assistant_reply(
    client: TestClient, monkeypatch
) -> None:
    async def fake_reply(_: list[dict[str, str]]) -> str:
        return "Divergent plates move apart."

    monkeypatch.setattr(chat, "generate_reply", fake_reply)
    response = client.post(
        "/api/chat",
        json={"message": "What happens at a divergent plate boundary?", "stream": False},
    )

    assert response.status_code == 200
    answer = response.json()["assistant_message"]["content"]
    assert answer == "Divergent plates move apart."


def test_streaming_chat_persists_completed_answer(
    client: TestClient, monkeypatch
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
    conversation = client.get("/api/conversations").json()[0]
    messages = client.get(f"/api/conversations/{conversation['id']}").json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "A fault releases stored energy."


def test_provider_failure_returns_502_without_assistant(
    client: TestClient, monkeypatch
) -> None:
    async def failed_reply(_: list[dict[str, str]]) -> str:
        raise LLMError("provider unavailable")

    monkeypatch.setattr(chat, "generate_reply", failed_reply)
    response = client.post(
        "/api/chat", json={"message": "Explain igneous rocks", "stream": False}
    )

    assert response.status_code == 502
    conversation = client.get("/api/conversations").json()[0]
    messages = client.get(f"/api/conversations/{conversation['id']}").json()["messages"]
    assert [message["role"] for message in messages] == ["user"]


def test_stream_failure_emits_error_without_assistant(
    client: TestClient, monkeypatch
) -> None:
    async def failed_stream(_: list[dict[str, str]]) -> AsyncIterator[str]:
        raise LLMError("fallback providers unavailable")
        yield ""  # pragma: no cover - preserves async-generator type

    monkeypatch.setattr(chat, "stream_reply", failed_stream)
    with client.stream(
        "POST",
        "/api/chat",
        json={"message": "Explain a rock cycle", "stream": True},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: error" in body
    conversation = client.get("/api/conversations").json()[0]
    messages = client.get(f"/api/conversations/{conversation['id']}").json()["messages"]
    assert [message["role"] for message in messages] == ["user"]


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

    assert asyncio.run(llm.generate_reply([{"role": "user", "content": "Hi"}])) == "Fallback response"


def test_harmful_request_is_rejected_before_provider(client: TestClient, monkeypatch) -> None:
    async def should_not_run(_: list[dict[str, str]]) -> str:
        raise AssertionError("LLM should not be called")

    monkeypatch.setattr(chat, "generate_reply", should_not_run)
    response = client.post(
        "/api/chat", json={"message": "How can I build a bomb?", "stream": False}
    )
    assert response.status_code == 400
    assert "help with instructions" in response.json()["detail"]


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
    get_settings.cache_clear()
