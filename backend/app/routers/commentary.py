"""FastAPI router for POST /api/commentary."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRouter

from app.core.auth import UserCtx, get_user
from app.core.gemini import call_gemini_stream

logger = logging.getLogger("career_evaluation.commentary")

router = APIRouter(prefix="/api", tags=["commentary"])

_MODEL = "gemini-flash-latest"
_TEMPERATURE = 0.9

_SYSTEM_PROMPT = """당신은 건설회사 채용팀의 경력 분석 AI입니다.
지원자의 서류를 읽으면서 확인한 사실을 간결하게 보고하듯 말해주세요.

규칙:
- 존댓말, 짧은 문장 ("~확인됩니다", "~있습니다", "~하셨네요")
- 한 문장씩 줄바꿈으로 구분
- 5~8문장
- 사실 위주로 담백하게. 과한 감탄이나 칭찬 금지
- 지원자의 실제 회사명, 경력 기간, 자격증 등 구체적 정보를 언급
- 첫 문장: 지원자 이름과 함께 시작
- 마지막 문장: "경력을 분석하겠습니다." 류로 마무리
- JSON이 아닌 일반 텍스트로 출력
- 이모지 사용 금지
- 한국어 맞춤법과 띄어쓰기를 정확히 지킬 것"""


def build_prompt(extraction_result: dict) -> str:
    """Compact extractionResult into a short user prompt to reduce tokens."""
    resume = extraction_result.get("resumeData") or {}
    cert = extraction_result.get("certificateData") or {}

    name = (
        (resume.get("personal_info") or {}).get("name_korean")
        or (cert.get("personal_info") or {}).get("name_korean")
        or "지원자"
    )

    careers = [
        {
            "company": c.get("company_name"),
            "project": c.get("project_name"),
            "period": f"{c.get('period_start')} ~ {c.get('period_end') or '재직중'}",
            "type": c.get("construction_type"),
            "task": c.get("task_type"),
        }
        for c in (resume.get("careers") or [])[:10]
    ]

    cert_careers = [
        {
            "company": c.get("company_name"),
            "project": c.get("project_name"),
            "type": c.get("construction_type"),
        }
        for c in (cert.get("technical_career") or [])[:10]
    ]

    summary = {
        "name": name,
        "careers": careers,
        "certCareers": cert_careers,
        "education": resume.get("education") or cert.get("education") or [],
        "certifications": resume.get("certifications") or cert.get("certifications") or [],
        "hasCertificate": bool(cert),
        "careerCount": len(resume.get("careers") or []) + len(cert.get("technical_career") or []),
    }

    return f"다음 지원자의 서류 내용을 보고 코멘트해주세요:\n\n{json.dumps(summary, ensure_ascii=False, indent=2)}"


@router.post("/commentary")
async def commentary(
    request: Request,
    user: UserCtx = Depends(get_user),
) -> StreamingResponse:
    body = await request.json()
    extraction_result = body.get("extractionResult")

    if not extraction_result:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="extractionResult required")

    user_prompt = build_prompt(extraction_result)

    async def generate() -> AsyncGenerator[bytes, None]:
        stream = call_gemini_stream(
            _SYSTEM_PROMPT,
            user_prompt,
            model=_MODEL,
            temperature=_TEMPERATURE,
        )
        try:
            async for chunk in stream:
                if await request.is_disconnected():
                    logger.info("client disconnected; stopping commentary stream")
                    break
                yield chunk.encode("utf-8")
        except Exception:
            logger.exception("Commentary stream error")

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "Transfer-Encoding": "chunked",
        },
    )
