from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.supabase import get_common_schema_client

router = APIRouter(prefix="/api", tags=["companies"])


@router.get("/companies")
async def list_companies() -> dict:
    try:
        client = get_common_schema_client()
        res = client.table("companies").select("id, name").order("name").execute()
        return {"companies": res.data or []}
    except Exception:
        raise HTTPException(status_code=500, detail="failed to load companies")
