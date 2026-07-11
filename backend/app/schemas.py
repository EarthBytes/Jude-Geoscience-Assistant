from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


TaskType = Literal[
    "general",
    "facts",
    "compare",
    "borders",
    "concepts",
    "quiz",
    "map",
]


class ConversationCreate(BaseModel):
    title: str = "New chat"


class ConversationUpdate(BaseModel):
    title: str


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: str


class ConversationDetail(ConversationOut):
    messages: List[MessageOut] = Field(default_factory=list)


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(..., min_length=1)
    task: TaskType = "general"
    stream: bool = True


class ChatResponse(BaseModel):
    conversation_id: str
    user_message: MessageOut
    assistant_message: MessageOut
