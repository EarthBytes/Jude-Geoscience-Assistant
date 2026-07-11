import json
from typing import AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.schemas import ChatRequest, ChatResponse, MessageOut
from app.services import conversations as store
from app.services.llm import LLMError, generate_reply, stream_reply
from app.services.prompts import build_messages, title_from_message

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _ensure_conversation(conversation_id: Optional[str], first_message: str) -> dict:
    if conversation_id:
        existing = store.get_conversation(conversation_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return existing

    return store.create_conversation(title=title_from_message(first_message))


@router.post("")
async def chat(body: ChatRequest):
    question = body.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conversation = _ensure_conversation(body.conversation_id, question)
    conversation_id = conversation["id"]

    # Auto-title first message on brand-new chats
    history = store.list_messages(conversation_id)
    if not history and conversation["title"] in ("New chat", "New Chat"):
        store.update_conversation_title(conversation_id, title_from_message(question))

    user_message = store.add_message(conversation_id, "user", question)
    llm_messages = build_messages(history, body.task, question)

    if body.stream:
        return EventSourceResponse(
            _stream_events(conversation_id, user_message, llm_messages)
        )

    try:
        reply = await generate_reply(llm_messages)
    except LLMError as exc:
        # Keep the user message; surface error to client
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    assistant_message = store.add_message(conversation_id, "assistant", reply)
    return ChatResponse(
        conversation_id=conversation_id,
        user_message=MessageOut(**user_message),
        assistant_message=MessageOut(**assistant_message),
    )


async def _stream_events(
    conversation_id: str,
    user_message: dict,
    llm_messages: List[Dict[str, str]],
) -> AsyncIterator[dict]:
    yield {
        "event": "meta",
        "data": json.dumps(
            {
                "conversation_id": conversation_id,
                "user_message": user_message,
            }
        ),
    }
    print("STREAM STARTED")
    chunks: list[str] = []
    try:
        async for token in stream_reply(llm_messages):
            chunks.append(token)
            yield {"event": "token", "data": json.dumps({"content": token})}
            print("TOKEN:", token)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        yield {
            "event": "error",
            "data": json.dumps({"detail": str(exc)}),
        }
        return

    full_reply = "".join(chunks).strip()
    if not full_reply:
        yield {
            "event": "error",
            "data": json.dumps({"detail": "LLM returned an empty response."}),
        }
        return

    assistant_message = store.add_message(conversation_id, "assistant", full_reply)
    yield {
        "event": "done",
        "data": json.dumps(
            {
                "conversation_id": conversation_id,
                "assistant_message": assistant_message,
            }
        ),
    }
