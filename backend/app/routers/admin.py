from __future__ import annotations

import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import UserCtx, get_user_optional, is_admin, require_admin
from app.core.supabase import get_service_client

logger = logging.getLogger("career_evaluation.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/check")
async def check_admin(user: UserCtx | None = Depends(get_user_optional)) -> dict:
    if not user:
        return {"isAdmin": False}
    return {"isAdmin": await is_admin(user.user_id)}


@router.get("/members")
async def list_members(user: UserCtx = Depends(require_admin)) -> dict:
    def _fetch_users():
        client = get_service_client()
        res = client.schema("public").rpc("get_all_users").execute()
        return res

    try:
        result = await asyncio.to_thread(_fetch_users)
        data = result.data or []

        members = [
            {
                "id": u.get("id"),
                "email": u.get("email") or "",
                "name": (u.get("raw_user_meta_data") or {}).get("name") or "",
                "company_name": (u.get("raw_user_meta_data") or {}).get("company_name") or "",
                "employee_number": (u.get("raw_user_meta_data") or {}).get("employee_number") or "",
                "created_at": u.get("created_at"),
            }
            for u in data
        ]

        return {"members": members}
    except Exception as exc:
        logger.error("get_all_users error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch users")
