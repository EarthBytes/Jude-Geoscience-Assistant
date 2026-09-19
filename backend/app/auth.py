from __future__ import annotations

from typing import Annotated, Optional

import jwt
from fastapi import Depends, Header, HTTPException, Request
from jwt import PyJWKClient
from pydantic import BaseModel

from app.config import get_settings

_jwks_client: Optional[PyJWKClient] = None
_jwks_url: Optional[str] = None


class User(BaseModel):
    id: str


def _jwks() -> PyJWKClient:
    global _jwks_client, _jwks_url
    settings = get_settings()
    if not settings.resolved_clerk_jwks_url:
        raise HTTPException(status_code=401, detail="Authentication is not configured.")
    if _jwks_client is None or _jwks_url != settings.resolved_clerk_jwks_url:
        _jwks_client = PyJWKClient(settings.resolved_clerk_jwks_url)
        _jwks_url = settings.resolved_clerk_jwks_url
    return _jwks_client


def verify_clerk_token(token: str) -> str:
    settings = get_settings()
    signing_key = _jwks().get_signing_key_from_jwt(token)
    options = {
        "verify_aud": bool(settings.clerk_audience),
        "verify_iss": bool(settings.resolved_clerk_issuer),
    }
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.clerk_audience or None,
        issuer=settings.resolved_clerk_issuer or None,
        options=options,
    )
    user_id = payload.get("sub")
    if not user_id or not isinstance(user_id, str):
        raise HTTPException(status_code=401, detail="Invalid session.")
    authorized = settings.clerk_authorized_party_list
    azp = payload.get("azp")
    if authorized and azp not in authorized:
        raise HTTPException(status_code=401, detail="Invalid session.")
    return user_id


def get_optional_user(
    request: Request,
    authorization: Annotated[Optional[str], Header()] = None,
) -> Optional[User]:
    settings = get_settings()
    if settings.environment == "test":
        test_id = request.headers.get("x-user-id")
        if test_id:
            return User(id=test_id)

    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    try:
        return User(id=verify_clerk_token(token.strip()))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=401, detail="Invalid or expired session."
        ) from exc


def require_user(
    user: Annotated[Optional[User], Depends(get_optional_user)],
) -> User:
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in to save and load conversations.",
        )
    return user
