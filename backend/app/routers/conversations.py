from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Response

from app.schemas import (
    ConversationCreate,
    ConversationDetail,
    ConversationOut,
    ConversationUpdate,
    MessageOut,
)
from app.services import conversations as store

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=List[ConversationOut])
def get_conversations() -> List[ConversationOut]:
    return [ConversationOut(**row) for row in store.list_conversations()]


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(body: ConversationCreate) -> ConversationOut:
    row = store.create_conversation(title=body.title.strip() or "New chat")
    return ConversationOut(**row)


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str) -> ConversationDetail:
    conversation = store.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = [MessageOut(**m) for m in store.list_messages(conversation_id)]
    return ConversationDetail(**conversation, messages=messages)


@router.patch("/{conversation_id}", response_model=ConversationOut)
def rename_conversation(
    conversation_id: str, body: ConversationUpdate
) -> ConversationOut:
    updated = store.update_conversation_title(
        conversation_id, body.title.strip() or "New chat"
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut(**updated)


@router.delete("/{conversation_id}", status_code=204, response_class=Response)
def delete_conversation(conversation_id: str) -> Response:
    deleted = store.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return Response(status_code=204)
