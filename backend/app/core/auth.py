from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from urllib.parse import urlparse

import jwt
from fastapi import Depends, HTTPException, Request

from app.core.config import get_settings

logger = logging.getLogger("career_evaluation.auth")


@dataclass(frozen=True)
class UserCtx:
    user_id: str
    email: str | None
    role: str | None
    is_admin: bool = field(default=False)


def _supabase_project_ref() -> str:
    url = get_settings().next_public_supabase_url
    # e.g. https://abcdefgh.supabase.co → "abcdefgh"
    hostname = urlparse(url).hostname or ""
    return hostname.split(".")[0]


def _extract_token(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer "):]

    ref = _supabase_project_ref()
    cookie_names = [
        f"sb-{ref}-auth-token",
        "sb-access-token",
    ]

    # Supabase SSR may store the session either as a single cookie or split
    # across .0, .1, ... chunks. The payload is either JSON or
    # "base64-<base64(JSON)>". Handle both layouts uniformly.
    import base64 as _b64

    def _parse_session_value(name: str, combined: str) -> str | None:
        logger.debug("cookie %s combined prefix=%r len=%d", name, combined[:20], len(combined))

        if combined.startswith("base64-"):
            try:
                decoded_bytes = _b64.b64decode(combined[len("base64-"):] + "===", validate=False)
                combined = decoded_bytes.decode("utf-8", errors="replace")
                logger.debug("cookie %s after base64 decode prefix=%r len=%d", name, combined[:40], len(combined))
            except Exception as exc:
                logger.debug("base64 decode failed for %s: %s", name, exc)
                return None

        try:
            parsed = json.loads(combined)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.debug("json decode failed for %s: %s (combined[:120]=%r)", name, exc, combined[:120])
            return None

        if isinstance(parsed, dict):
            tok = parsed.get("access_token")
            if tok:
                logger.debug("cookie %s → extracted access_token (len=%d)", name, len(tok))
                return tok
            logger.debug("cookie %s parsed dict but no access_token key (keys=%s)", name, list(parsed.keys()))
        elif isinstance(parsed, list) and parsed and isinstance(parsed[0], str):
            logger.debug("cookie %s → list first elem (len=%d)", name, len(parsed[0]))
            return parsed[0]
        else:
            logger.debug("cookie %s parsed but unexpected shape type=%s", name, type(parsed).__name__)
        return None

    for name in cookie_names:
        raw = request.cookies.get(name)
        if raw:
            tok = _parse_session_value(name, raw)
            if tok:
                return tok

        parts: list[str] = []
        idx = 0
        while True:
            part = request.cookies.get(f"{name}.{idx}")
            if part is None:
                break
            parts.append(part)
            idx += 1
        if parts:
            tok = _parse_session_value(name, "".join(parts))
            if tok:
                return tok

    return None


_jwks_client: jwt.PyJWKClient | None = None


def _get_jwks_client() -> jwt.PyJWKClient | None:
    """Lazy-build a PyJWKClient pointed at the Supabase project's JWKS."""
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client

    url = get_settings().next_public_supabase_url
    if not url:
        return None
    # 1 hour cache; Supabase rotates keys rarely.
    _jwks_client = jwt.PyJWKClient(
        f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json",
        cache_keys=True,
        lifespan=3600,
    )
    return _jwks_client


def _decode_local(token: str) -> dict | None:
    """Verify the JWT locally.

    Path 1 (preferred): ES256 via Supabase JWKS — no secret required.
    Path 2 (fallback): HS256 via SUPABASE_JWT_SECRET — for self-hosted / legacy.
    """
    # Path 1 — JWKS / ES256
    try:
        client = _get_jwks_client()
        if client is not None:
            signing_key = client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        logger.debug("JWKS local decode failed: %s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.debug("JWKS fetch failed: %s", exc)

    # Path 2 — HS256 secret fallback
    secret = get_settings().supabase_jwt_secret
    if not secret:
        return None
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.InvalidTokenError:
        return None


async def _verify_remote(token: str) -> dict | None:
    from app.core.supabase import get_anon_client

    try:
        client = get_anon_client()
        res = await __import__("asyncio").to_thread(client.auth.get_user, token)
        user = getattr(res, "user", None)
        if not user or not getattr(user, "id", None):
            return None
        return {
            "sub": user.id,
            "email": getattr(user, "email", None),
            "role": getattr(user, "role", None),
        }
    except Exception as exc:
        logger.debug("remote token verification failed: %s", exc)
        return None


async def get_user_optional(request: Request) -> UserCtx | None:
    token = _extract_token(request)
    cookie_names = list(request.cookies.keys())
    has_auth_header = "authorization" in {k.lower() for k in request.headers.keys()}
    if not token:
        logger.debug(
            "auth: no token — path=%s cookies=%s auth_header=%s",
            request.url.path, cookie_names, has_auth_header,
        )
        return None

    payload = _decode_local(token)
    source = "local"
    if payload is None:
        payload = await _verify_remote(token)
        source = "remote"
        if payload is None:
            logger.info("auth: token present but both local+remote failed (path=%s)", request.url.path)
            return None

    user_id = payload.get("sub")
    if not user_id:
        logger.info("auth: payload has no sub (source=%s)", source)
        return None
    logger.debug("auth: ok user_id=%s source=%s", user_id, source)
    return UserCtx(
        user_id=user_id,
        email=payload.get("email"),
        role=payload.get("role"),
    )


async def get_user(request: Request) -> UserCtx:
    user = await get_user_optional(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


async def is_admin(user_id: str) -> bool:
    from app.core.supabase import get_service_client

    try:
        client = get_service_client()
        res = (
            client.table("admins")
            .select("user_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as exc:
        logger.warning("is_admin lookup failed for %s: %s", user_id, exc)
        return False


async def require_admin(user: UserCtx = Depends(get_user)) -> UserCtx:
    if not await is_admin(user.user_id):
        raise HTTPException(status_code=403, detail="Admin required")
    return UserCtx(
        user_id=user.user_id,
        email=user.email,
        role=user.role,
        is_admin=True,
    )
