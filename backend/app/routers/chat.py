from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Annotated, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app.auth import User, get_optional_user
from app.database import utc_now
from app.schemas import ChatRequest, ChatResponse, MessageOut
from app.services import conversations as store
from app.services import memory as memory_store
from app.services.llm import LLMError, generate_reply, stream_reply
from app.services.prompts import build_messages, title_from_message
from app.services.rate_limit import enforce_chat_limit
from app.services.safety import blocked_request

logger = logging.getLogger(__name__)

CLIENT_LLM_ERROR = "The assistant is temporarily unavailable. Please try again."
SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _ephemeral_message(
    role: str, content: str, conversation_id: str = "guest"
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "timestamp": utc_now(),
    }


def _ensure_conversation(
    user_id: str, conversation_id: Optional[str], first_message: str
) -> dict:
    if conversation_id:
        existing = store.get_conversation(user_id, conversation_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return existing
    return store.create_conversation(
        user_id, title=title_from_message(first_message)
    )


def _sse_response(events: AsyncIterator[dict]) -> EventSourceResponse:
    return EventSourceResponse(
        events,
        ping=15,
        headers=SSE_HEADERS,
    )


@router.post("")
async def chat(
    request: Request,
    body: ChatRequest,
    user: Annotated[Optional[User], Depends(get_optional_user)],
):
    question = body.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    safety_message = blocked_request(question)
    if safety_message:
        raise HTTPException(status_code=400, detail=safety_message)

    enforce_chat_limit(request, user.id if user else None)

    notes = body.context.strip()
    if notes and blocked_request(notes):
        notes = ""
    if user is not None:
        memory_store.upsert_memory(user.id, notes)

    if user is None:
        history = [turn.model_dump() for turn in body.history]
        llm_messages = build_messages(history, body.task, question, context=notes)
        user_message = _ephemeral_message("user", question)
        if body.stream:
            return _sse_response(
                _stream_events(
                    conversation_id=None,
                    user_message=user_message,
                    llm_messages=llm_messages,
                    persist_user_id=None,
                )
            )
        try:
            reply = await generate_reply(llm_messages)
        except LLMError as exc:
            logger.warning("Guest chat failed: %s", exc)
            raise HTTPException(status_code=502, detail=CLIENT_LLM_ERROR) from exc
        assistant_message = _ephemeral_message("assistant", reply)
        return ChatResponse(
            conversation_id=None,
            persisted=False,
            user_message=MessageOut(**user_message),
            assistant_message=MessageOut(**assistant_message),
        )

    if body.regenerate:
        if not body.conversation_id:
            raise HTTPException(
                status_code=400, detail="conversation_id is required to regenerate"
            )
        conversation = store.get_conversation(user.id, body.conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conversation_id = conversation["id"]
        store.rewind_messages(user.id, conversation_id, "assistant")
        history = store.list_messages(user.id, conversation_id)
        if not history or history[-1]["role"] != "user":
            raise HTTPException(status_code=400, detail="Nothing to regenerate")
        user_message = history[-1]
        question = user_message["content"]
        llm_messages = build_messages(history[:-1], body.task, question, context=notes)
    else:
        conversation = _ensure_conversation(user.id, body.conversation_id, question)
        conversation_id = conversation["id"]
        history = store.list_messages(user.id, conversation_id)
        if not history and conversation["title"] in ("New chat", "New Chat"):
            store.update_conversation_title(
                user.id, conversation_id, title_from_message(question)
            )

        user_message = store.add_message(user.id, conversation_id, "user", question)
        llm_messages = build_messages(history, body.task, question, context=notes)

    if body.stream:
        return _sse_response(
            _stream_events(
                conversation_id=conversation_id,
                user_message=user_message,
                llm_messages=llm_messages,
                persist_user_id=user.id,
            )
        )

    try:
        reply = await generate_reply(llm_messages)
    except LLMError as exc:
        logger.warning("Member chat failed: %s", exc)
        raise HTTPException(status_code=502, detail=CLIENT_LLM_ERROR) from exc

    assistant_message = store.add_message(
        user.id, conversation_id, "assistant", reply
    )
    return ChatResponse(
        conversation_id=conversation_id,
        persisted=True,
        user_message=MessageOut(**user_message),
        assistant_message=MessageOut(**assistant_message),
    )


async def _stream_events(
    conversation_id: Optional[str],
    user_message: dict,
    llm_messages: List[Dict[str, str]],
    persist_user_id: Optional[str],
) -> AsyncIterator[dict]:
    yield {
        "event": "meta",
        "data": json.dumps(
            {
                "conversation_id": conversation_id,
                "persisted": persist_user_id is not None,
                "user_message": user_message,
            }
        ),
    }
    chunks: list[str] = []
    started = time.perf_counter()
    first_token_at: Optional[float] = None
    try:
        async for token in stream_reply(llm_messages):
            if first_token_at is None:
                first_token_at = time.perf_counter() - started
                logger.info("Chat first token after %.2fs", first_token_at)
            chunks.append(token)
            yield {"event": "token", "data": json.dumps({"content": token})}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chat stream failed: %s", exc)
        yield {
            "event": "error",
            "data": json.dumps({"detail": CLIENT_LLM_ERROR}),
        }
        return

    full_reply = "".join(chunks).strip()
    if not full_reply:
        yield {
            "event": "error",
            "data": json.dumps({"detail": "The assistant returned an empty response."}),
        }
        return

    if persist_user_id and conversation_id:
        assistant_message = store.add_message(
            persist_user_id, conversation_id, "assistant", full_reply
        )
    else:
        assistant_message = _ephemeral_message(
            "assistant", full_reply, conversation_id or "guest"
        )

    yield {
        "event": "done",
        "data": json.dumps(
            {
                "conversation_id": conversation_id,
                "persisted": persist_user_id is not None,
                "assistant_message": assistant_message,
            }
        ),
    }
