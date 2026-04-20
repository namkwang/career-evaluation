from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import UserCtx, get_user, is_admin
from app.core.supabase import get_service_client
from app.schemas.feedback import Feedback, FeedbackCreateRequest

logger = logging.getLogger("career_evaluation.feedback")

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.get("")
async def list_feedback(
    applicant_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    current_user: UserCtx = Depends(get_user),
) -> dict:
    client = get_service_client()
    query = (
        client.table("feedbacks")
        .select("*")
        .order("created_at", desc=True)
        .limit(500)
    )

    admin = await is_admin(current_user.user_id)

    if applicant_id:
        try:
            uuid.UUID(applicant_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid applicant_id UUID")
        query = query.eq("applicant_id", applicant_id)
    else:
        if not admin:
            query = query.eq("user_id", current_user.user_id)
        elif user_id:
            query = query.eq("user_id", user_id)

    try:
        res = query.execute()
    except Exception as exc:
        logger.error("list_feedback failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return {"feedbacks": res.data}


@router.post("")
async def create_feedback(
    body: FeedbackCreateRequest,
    current_user: UserCtx = Depends(get_user),
) -> dict:
    if not body.content or not body.content.strip():
        raise HTTPException(status_code=400, detail="내용을 입력해주세요.")

    insert_data = {
        "category": body.category,
        "content": body.content.strip(),
        "applicant_id": body.applicant_id,
        "applicant_name": body.applicant_name,
        "page": body.page,
        "user_name": body.user_name,
        "user_id": current_user.user_id,
    }

    try:
        res = (
            get_service_client()
            .table("feedbacks")
            .insert(insert_data)
            .execute()
        )
    except Exception as exc:
        logger.error("create_feedback failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    if not res.data:
        raise HTTPException(status_code=500, detail="Insert returned no data")

    return {"feedback": res.data[0]}


@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: str,
    current_user: UserCtx = Depends(get_user),
) -> dict:
    try:
        uuid.UUID(feedback_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid feedback id UUID")

    admin = await is_admin(current_user.user_id)

    client = get_service_client()
    query = client.table("feedbacks").delete().eq("id", feedback_id)
    if not admin:
        query = query.eq("user_id", current_user.user_id)

    try:
        res = query.execute()
    except Exception as exc:
        logger.error("delete_feedback %s failed: %s", feedback_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))

    if not res.data:
        raise HTTPException(status_code=403, detail="not found or not authorized")

    return {"success": True}
