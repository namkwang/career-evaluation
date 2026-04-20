"""FastAPI router for POST /api/employment."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import UserCtx, get_user
from app.core.prompts import step3_employment
from app.schemas.employment import EmploymentRequest, EmploymentResponse
from app.services.employment import run_employment

logger = logging.getLogger("career_evaluation.employment")

router = APIRouter(prefix="/api", tags=["employment"])


@router.post("/employment", response_model=EmploymentResponse)
async def employment(
    req: EmploymentRequest,
    user: UserCtx = Depends(get_user),
) -> EmploymentResponse:
    try:
        prompts = step3_employment()
        result = await run_employment(req.mergeResult, req.certificateWorkHistory, prompts)
    except Exception as e:  # noqa: BLE001 — mirror TS catch-all to client
        logger.exception("Employment type error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e) if str(e) else "고용형태 판정 중 오류가 발생했습니다.",
        ) from e
    return EmploymentResponse(employmentResult=result)
