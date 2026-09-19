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

MAX_MESSAGE_LENGTH = 8000
MAX_TITLE_LENGTH = 200
MAX_HISTORY_TURNS = 32
MAX_IMPORT_MESSAGES = 100
MAX_IMPORT_CONVERSATIONS = 20
MAX_CONTEXT_LENGTH = 4000


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=MAX_MESSAGE_LENGTH)


class ConversationCreate(BaseModel):
    title: str = Field(default="New chat", max_length=MAX_TITLE_LENGTH)
    messages: List[HistoryTurn] = Field(default_factory=list, max_length=MAX_IMPORT_MESSAGES)


class ConversationImportRequest(BaseModel):
    conversations: List[ConversationCreate] = Field(
        ..., min_length=1, max_length=MAX_IMPORT_CONVERSATIONS
    )


class ConversationUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=MAX_TITLE_LENGTH)


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
    message: str = Field(..., min_length=1, max_length=MAX_MESSAGE_LENGTH)
    task: TaskType = "general"
    stream: bool = True
    history: List[HistoryTurn] = Field(default_factory=list, max_length=MAX_HISTORY_TURNS)
    context: str = Field(default="", max_length=MAX_CONTEXT_LENGTH)


class ChatResponse(BaseModel):
    conversation_id: Optional[str] = None
    persisted: bool = False
    user_message: MessageOut
    assistant_message: MessageOut


class MemoryUpdate(BaseModel):
    content: str = Field(default="", max_length=MAX_CONTEXT_LENGTH)


class MemoryOut(BaseModel):
    content: str
    updated_at: str = ""


class ChatResponse(BaseModel):
    conversation_id: Optional[str] = None
    persisted: bool = False
    user_message: MessageOut
    assistant_message: MessageOut
