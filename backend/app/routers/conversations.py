from __future__ import annotations

from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.auth import User, require_user
from app.schemas import (
    ConversationCreate,
    ConversationDetail,
    ConversationImportRequest,
    ConversationOut,
    ConversationUpdate,
    MessageOut,
)
from app.services import conversations as store
from app.services.prompts import title_from_message

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _owned_or_404(user_id: str, conversation_id: str) -> dict:
    conversation = store.get_conversation(user_id, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.get("", response_model=List[ConversationOut])
def get_conversations(user: User = Depends(require_user)) -> List[ConversationOut]:
    return [ConversationOut(**row) for row in store.list_conversations(user.id)]


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(
    body: ConversationCreate, user: User = Depends(require_user)
) -> ConversationOut:
    title = body.title.strip() or "New chat"
    messages = [turn.model_dump() for turn in body.messages]
    if not body.title.strip() and messages:
        first_user = next((m["content"] for m in messages if m["role"] == "user"), "")
        title = title_from_message(first_user)
    row = store.create_conversation(user.id, title=title, messages=messages)
    return ConversationOut(**row)


@router.post("/import", response_model=List[ConversationOut], status_code=201)
def import_conversations(
    body: ConversationImportRequest, user: User = Depends(require_user)
) -> List[ConversationOut]:
    created: List[ConversationOut] = []
    for item in body.conversations:
        title = item.title.strip() or "New chat"
        messages = [turn.model_dump() for turn in item.messages]
        if not item.title.strip() and messages:
            first_user = next(
                (m["content"] for m in messages if m["role"] == "user"), ""
            )
            title = title_from_message(first_user)
        row = store.create_conversation(user.id, title=title, messages=messages)
        created.append(ConversationOut(**row))
    return created


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: str, user: User = Depends(require_user)
) -> ConversationDetail:
    conversation = _owned_or_404(user.id, conversation_id)
    messages = [
        MessageOut(**m) for m in store.list_messages(user.id, conversation_id)
    ]
    return ConversationDetail(**conversation, messages=messages)


@router.patch("/{conversation_id}", response_model=ConversationOut)
def rename_conversation(
    conversation_id: str,
    body: ConversationUpdate,
    user: User = Depends(require_user),
) -> ConversationOut:
    updated = store.update_conversation_title(
        user.id, conversation_id, body.title.strip() or "New chat"
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut(**updated)


@router.delete("/{conversation_id}/trailing")
def rewind_trailing(
    conversation_id: str,
    scope: Literal["assistant", "turn"] = Query("assistant"),
    user: User = Depends(require_user),
) -> dict:
    _owned_or_404(user.id, conversation_id)
    deleted = store.rewind_messages(user.id, conversation_id, scope)
    return {"deleted": deleted}


@router.delete("/{conversation_id}", status_code=204, response_class=Response)
def delete_conversation(
    conversation_id: str, user: User = Depends(require_user)
) -> Response:
    deleted = store.delete_conversation(user.id, conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return Response(status_code=204)
