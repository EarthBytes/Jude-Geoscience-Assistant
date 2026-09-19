from __future__ import annotations

from typing import Dict

from sqlalchemy import select

from app.database import db_session, utc_now
from app.models import UserMemory


def get_memory(user_id: str) -> Dict[str, str]:
    with db_session() as session:
        row = session.scalar(
            select(UserMemory).where(UserMemory.user_id == user_id)
        )
        if row is None:
            return {"content": "", "updated_at": ""}
        return {"content": row.content, "updated_at": row.updated_at}


def upsert_memory(user_id: str, content: str) -> Dict[str, str]:
    now = utc_now()
    with db_session() as session:
        row = session.scalar(
            select(UserMemory).where(UserMemory.user_id == user_id)
        )
        if row is None:
            row = UserMemory(user_id=user_id, content=content, updated_at=now)
            session.add(row)
        else:
            row.content = content
            row.updated_at = now
        session.flush()
        return {"content": row.content, "updated_at": row.updated_at}
