from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import User, require_user
from app.schemas import MemoryOut, MemoryUpdate
from app.services import memory as store

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("", response_model=MemoryOut)
def get_memory(user: User = Depends(require_user)) -> MemoryOut:
    return MemoryOut(**store.get_memory(user.id))


@router.put("", response_model=MemoryOut)
def put_memory(
    body: MemoryUpdate, user: User = Depends(require_user)
) -> MemoryOut:
    return MemoryOut(**store.upsert_memory(user.id, body.content.strip()))
