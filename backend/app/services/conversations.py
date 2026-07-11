from __future__ import annotations

import uuid
from typing import Dict, List, Optional

from app.database import db_session, row_to_dict, utc_now


def list_conversations() -> List[dict]:
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            ORDER BY updated_at DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def get_conversation(conversation_id: str) -> Optional[Dict]:
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
        return row_to_dict(row)


def create_conversation(title: str = "New chat") -> Dict:
    conversation_id = str(uuid.uuid4())
    now = utc_now()
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO conversations (id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (conversation_id, title, now, now),
        )
    return {
        "id": conversation_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }


def update_conversation_title(conversation_id: str, title: str) -> Optional[Dict]:
    now = utc_now()
    with db_session() as conn:
        cursor = conn.execute(
            """
            UPDATE conversations
            SET title = ?, updated_at = ?
            WHERE id = ?
            """,
            (title, now, conversation_id),
        )
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
        return row_to_dict(row)


def touch_conversation(conversation_id: str) -> None:
    with db_session() as conn:
        conn.execute(
            """
            UPDATE conversations
            SET updated_at = ?
            WHERE id = ?
            """,
            (utc_now(), conversation_id),
        )


def delete_conversation(conversation_id: str) -> bool:
    with db_session() as conn:
        cursor = conn.execute(
            "DELETE FROM conversations WHERE id = ?",
            (conversation_id,),
        )
        return cursor.rowcount > 0


def list_messages(conversation_id: str) -> List[dict]:
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT id, conversation_id, role, content, timestamp
            FROM messages
            WHERE conversation_id = ?
            ORDER BY timestamp ASC
            """,
            (conversation_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def add_message(conversation_id: str, role: str, content: str) -> Dict:
    message_id = str(uuid.uuid4())
    timestamp = utc_now()
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO messages (id, conversation_id, role, content, timestamp)
            VALUES (?, ?, ?, ?, ?)
            """,
            (message_id, conversation_id, role, content, timestamp),
        )
        conn.execute(
            """
            UPDATE conversations
            SET updated_at = ?
            WHERE id = ?
            """,
            (timestamp, conversation_id),
        )
    return {
        "id": message_id,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "timestamp": timestamp,
    }
