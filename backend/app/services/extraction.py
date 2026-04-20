"""PDF extraction service — shared helpers for /api/extract and /api/extract-stream.

Ports the TS logic from:
- src/app/api/extract/route.ts
- src/app/api/extract-stream/route.ts
"""

from __future__ import annotations

import logging
import re
from typing import Any, AsyncIterator

from app.core.gemini import (
    call_gemini_with_document,
    call_gemini_with_document_stream,
    parse_json_response,
)
from app.core.normalize import norm_name
from app.core.prompts import step1_certificate, step1_resume

logger = logging.getLogger("career_evaluation.extract")


# ---------------------------------------------------------------------------
# Non-streaming extraction
# ---------------------------------------------------------------------------


async def extract_resume(pdf_bytes: bytes) -> dict[str, Any]:
    """Run Step1 resume prompt against a PDF and return parsed JSON dict."""
    system_prompt, user_prompt = step1_resume()
    raw = await call_gemini_with_document(system_prompt, user_prompt, pdf_bytes)
    parsed = parse_json_response(raw)
    if not isinstance(parsed, dict):
        raise ValueError("resume extraction returned non-object JSON")
    return parsed


async def extract_certificate(pdf_bytes: bytes) -> dict[str, Any]:
    """Run Step1 certificate prompt against a PDF and return parsed JSON dict."""
    system_prompt, user_prompt = step1_certificate()
    raw = await call_gemini_with_document(system_prompt, user_prompt, pdf_bytes)
    parsed = parse_json_response(raw)
    if not isinstance(parsed, dict):
        raise ValueError("certificate extraction returned non-object JSON")
    return parsed


# ---------------------------------------------------------------------------
# Streaming extraction — yields raw text chunks
# ---------------------------------------------------------------------------


async def extract_resume_stream(pdf_bytes: bytes) -> AsyncIterator[str]:
    system_prompt, user_prompt = step1_resume()
    async for chunk in call_gemini_with_document_stream(system_prompt, user_prompt, pdf_bytes):
        yield chunk


async def extract_certificate_stream(pdf_bytes: bytes) -> AsyncIterator[str]:
    system_prompt, user_prompt = step1_certificate()
    async for chunk in call_gemini_with_document_stream(system_prompt, user_prompt, pdf_bytes):
        yield chunk


# ---------------------------------------------------------------------------
# Field extraction from streaming text — TS parity
# ---------------------------------------------------------------------------

_NAME_RE = re.compile(r'"name_korean"\s*:\s*"([^"]+)"')
_COMPANY_RE = re.compile(r'"company_name"\s*:\s*"([^"]+)"')
_PROJECT_RE = re.compile(r'"project_name"\s*:\s*"([^"]+)"')
_SCHOOL_RE = re.compile(r'"school_name"\s*:\s*"([^"]+)"')
_CERT_RE = re.compile(r'"type_and_grade"\s*:\s*"([^"]+)"')


def extract_fields_from_stream_text(accumulated_text: str) -> list[str]:
    """Pull out fields from partial streaming JSON text using the TS regex set.

    Returns a list of display strings in the same format the TS route emits
    (``이름: ...``, ``회사: ...``, ``현장: ...``, ``학교: ...``, ``자격증: ...``).
    Order and dedup rules mirror the TS implementation.
    """
    fields: list[str] = []
    seen: set[str] = set()

    name_match = _NAME_RE.search(accumulated_text)
    if name_match and "name" not in seen:
        seen.add("name")
        fields.append(f"이름: {name_match.group(1)}")

    for m in _COMPANY_RE.finditer(accumulated_text):
        key = f"company:{m.group(1)}"
        if key not in seen:
            seen.add(key)
            fields.append(f"회사: {m.group(1)}")

    for m in _PROJECT_RE.finditer(accumulated_text):
        key = f"project:{m.group(1)}"
        if key not in seen:
            seen.add(key)
            fields.append(f"현장: {m.group(1)}")

    for m in _SCHOOL_RE.finditer(accumulated_text):
        key = f"school:{m.group(1)}"
        if key not in seen:
            seen.add(key)
            fields.append(f"학교: {m.group(1)}")

    for m in _CERT_RE.finditer(accumulated_text):
        key = f"cert:{m.group(1)}"
        if key not in seen:
            seen.add(key)
            fields.append(f"자격증: {m.group(1)}")

    return fields


# ---------------------------------------------------------------------------
# Cross-document validation + phantom career removal — TS parity
# ---------------------------------------------------------------------------


def _phantom_filter_careers(
    resume: dict[str, Any], cert: dict[str, Any] | None
) -> None:
    """Remove resume careers that fall outside certificate work_history periods.

    Mutates ``resume['careers']`` in place when applicable.
    Mirrors the TS routes' phantom-removal block (extract-stream/route.ts).
    """
    if not cert:
        return
    careers = resume.get("careers")
    technical = cert.get("technical_career") or []
    if not isinstance(careers, list) or not technical:
        return

    work_history = cert.get("work_history") or []
    if not isinstance(work_history, list) or not work_history:
        return

    # FIXME parity: TS uses JS Date.getTime() (ms epoch). Here we rely on ISO
    # date string lexicographic comparisons — correct for the YYYY-MM-DD
    # strings the prompts produce, and avoids timezone ambiguity.
    from datetime import date, timedelta

    def _parse_day(s: Any) -> date | None:
        if not isinstance(s, str) or not s:
            return None
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None

    today = date.today()
    one_day = timedelta(days=1)

    periods: dict[str, list[tuple[date, date]]] = {}
    for wh in work_history:
        if not isinstance(wh, dict):
            continue
        key = norm_name(wh.get("company_name"))
        start = _parse_day(wh.get("period_start"))
        if start is None:
            continue
        end = _parse_day(wh.get("period_end")) or today
        periods.setdefault(key, []).append((start, end))

    if not periods:
        return

    def _keep(c: dict[str, Any]) -> bool:
        if not isinstance(c, dict):
            return True
        key = norm_name(c.get("company_name"))
        bucket = periods.get(key)
        if not bucket:
            return True  # not in cert → keep
        c_start = _parse_day(c.get("period_start"))
        c_end = _parse_day(c.get("period_end"))
        if c_start is None or c_end is None:
            return True
        # TS adds ±1 day slack; copy that behavior.
        return any(
            c_start >= (p_start - one_day) and c_end <= (p_end + one_day)
            for p_start, p_end in bucket
        )

    resume["careers"] = [c for c in careers if _keep(c)]


def validate_combined(
    resume: dict[str, Any] | None,
    cert: dict[str, Any] | None,
) -> dict[str, Any]:
    """Run cross-document validation and phantom-career removal.

    Returns ``{"warnings": [...], "errors": [...], "cleaned_resume": dict | None}``.
    The cleaned resume may have had phantom careers removed in-place (the
    input dict is mutated and returned for caller convenience).
    """
    errors: list[str] = []
    warnings: list[str] = []

    rd = resume if isinstance(resume, dict) else None
    cd = cert if isinstance(cert, dict) else None

    # 1. Resume slot actually holds a cert → abort
    if rd is not None:
        doc_info = rd.get("document_info") or {}
        if (
            isinstance(doc_info, dict)
            and doc_info.get("document_confirmation_number")
            and not rd.get("resume_format_type")
        ):
            errors.append(
                "이력서 칸에 경력증명서가 업로드되었습니다. 파일을 확인해주세요."
            )

    # 2. Cert slot actually holds a resume → abort
    if cd is not None:
        cert_doc_info = cd.get("document_info") or {}
        if cd.get("resume_format_type") and not (
            isinstance(cert_doc_info, dict)
            and cert_doc_info.get("document_confirmation_number")
        ):
            errors.append(
                "경력증명서 칸에 이력서가 업로드되었습니다. 파일을 확인해주세요."
            )

    # 3. Name mismatch between docs
    if cd is not None and rd is not None:
        rn_raw = (rd.get("personal_info") or {}).get("name_korean")
        cn_raw = (cd.get("personal_info") or {}).get("name_korean")
        rn = rn_raw.strip() if isinstance(rn_raw, str) else None
        cn = cn_raw.strip() if isinstance(cn_raw, str) else None
        if rn and cn and rn != cn:
            errors.append(
                f"이력서({rn})와 경력증명서({cn})의 지원자 이름이 다릅니다."
            )

    # 4. Missing name in resume
    if rd is not None:
        if not (rd.get("personal_info") or {}).get("name_korean"):
            errors.append(
                "이력서에서 지원자 이름을 추출하지 못했습니다. 파일 품질을 확인해주세요."
            )

    # 5. Missing name in cert
    if cd is not None and not (cd.get("personal_info") or {}).get("name_korean"):
        errors.append(
            "경력증명서에서 지원자 이름을 추출하지 못했습니다. 파일을 확인해주세요."
        )

    # 6. Warning: no career info at all
    if rd is not None:
        careers = rd.get("careers") or []
        wh = rd.get("work_history") or []
        if isinstance(careers, list) and isinstance(wh, list):
            if len(careers) == 0 and len(wh) == 0:
                warnings.append("이력서에서 경력 정보를 추출하지 못했습니다.")

    # Phantom career removal (only if both present)
    if rd is not None:
        _phantom_filter_careers(rd, cd)

    return {"warnings": warnings, "errors": errors, "cleaned_resume": rd}
