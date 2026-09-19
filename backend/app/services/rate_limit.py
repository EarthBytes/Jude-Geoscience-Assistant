from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request

from app.config import get_settings

_hits: Dict[str, Deque[float]] = defaultdict(deque)
_lock = Lock()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def enforce_chat_limit(request: Request, user_id: Optional[str]) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return

    now = time.monotonic()
    if user_id:
        key = f"user:{user_id}"
        limit = settings.member_chat_per_minute
    else:
        key = f"guest:{_client_ip(request)}"
        limit = settings.guest_chat_per_minute

    window = 60.0
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > window:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many questions. Please wait a moment and try again.",
            )
        bucket.append(now)
