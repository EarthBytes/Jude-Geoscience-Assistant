from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import db_session, utc_now
from app.models import Conversation, Message


def list_conversations(user_id: str) -> List[dict]:
    with db_session() as session:
        rows = session.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
        ).all()
        return [row.to_dict() for row in rows]


def get_conversation(user_id: str, conversation_id: str) -> Optional[Dict]:
    with db_session() as session:
        row = session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        return row.to_dict() if row else None


def create_conversation(
    user_id: str,
    title: str = "New chat",
    messages: Optional[List[dict]] = None,
) -> Dict:
    conversation_id = str(uuid.uuid4())
    now = utc_now()
    with db_session() as session:
        conversation = Conversation(
            id=conversation_id,
            user_id=user_id,
            title=title,
            created_at=now,
            updated_at=now,
        )
        session.add(conversation)
        timestamp = now
        base = datetime.now(timezone.utc)
        for index, item in enumerate(messages or []):
            timestamp = (base + timedelta(milliseconds=index)).isoformat()
            session.add(
                Message(
                    id=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    role=item["role"],
                    content=item["content"],
                    timestamp=timestamp,
                )
            )
        if messages:
            conversation.updated_at = timestamp
        session.flush()
        return conversation.to_dict()


def update_conversation_title(
    user_id: str, conversation_id: str, title: str
) -> Optional[Dict]:
    now = utc_now()
    with db_session() as session:
        row = session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        if row is None:
            return None
        row.title = title
        row.updated_at = now
        session.flush()
        return row.to_dict()


def delete_conversation(user_id: str, conversation_id: str) -> bool:
    with db_session() as session:
        row = session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        if row is None:
            return False
        session.delete(row)
        return True


def list_messages(user_id: str, conversation_id: str) -> List[dict]:
    with db_session() as session:
        conversation = session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        if conversation is None:
            return []
        rows = session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.timestamp.asc())
        ).all()
        return [row.to_dict() for row in rows]


def add_message(user_id: str, conversation_id: str, role: str, content: str) -> Dict:
    message_id = str(uuid.uuid4())
    timestamp = utc_now()
    with db_session() as session:
        conversation = session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        if conversation is None:
            raise KeyError("Conversation not found")
        message = Message(
            id=message_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
            timestamp=timestamp,
        )
        session.add(message)
        conversation.updated_at = timestamp
        session.flush()
        return message.to_dict()
