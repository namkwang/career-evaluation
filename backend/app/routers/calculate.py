"""FastAPI router for POST /api/calculate."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import UserCtx, get_user
from app.schemas.calculation import CalculateRequest, CalculateResponse
from app.services.calculation import run_calculation

logger = logging.getLogger("career_evaluation.calculation")

router = APIRouter(prefix="/api", tags=["calculate"])


@router.post("/calculate", response_model=CalculateResponse)
async def calculate(
    req: CalculateRequest,
    user: UserCtx = Depends(get_user),
) -> CalculateResponse:
    try:
        result = run_calculation(req.mergeResult, req.hiring_type)
    except Exception as e:  # noqa: BLE001 — mirror TS catch-all to client
        logger.exception("Calculate error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e) if str(e) else "경력산정 중 오류가 발생했습니다.",
        ) from e
    return CalculateResponse(calculateResult=result)
