"""FastAPI router for POST /api/merge."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import UserCtx, get_user
from app.schemas.merge import MergeRequest, MergeResponse
from app.services.merge import run_merge

logger = logging.getLogger("career_evaluation.merge")

router = APIRouter(prefix="/api", tags=["merge"])


@router.post("/merge", response_model=MergeResponse)
async def merge(
    req: MergeRequest,
    user: UserCtx = Depends(get_user),
) -> MergeResponse:
    try:
        result = await run_merge(
            resume_data=req.resumeData,
            certificate_data=req.certificateData,
            applied_field=req.applied_field,
            hiring_type=req.hiring_type,
        )
    except Exception as e:  # noqa: BLE001 — mirror TS catch-all
        logger.exception("Merge error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e) if str(e) else "병합 중 오류가 발생했습니다.",
        ) from e
    return MergeResponse(
        mergeResult=result["mergeResult"],
        rankingMatches=result["rankingMatches"],
    )
