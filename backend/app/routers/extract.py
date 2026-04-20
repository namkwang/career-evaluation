"""FastAPI router: POST /api/extract and POST /api/extract-stream.

Ports src/app/api/extract/route.ts and src/app/api/extract-stream/route.ts.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from app.core.auth import UserCtx, get_user
from app.core.gemini import parse_json_response
from app.services.extraction import (
    extract_certificate,
    extract_certificate_stream,
    extract_fields_from_stream_text,
    extract_resume,
    extract_resume_stream,
    validate_combined,
)

logger = logging.getLogger("career_evaluation.extract")

router = APIRouter(prefix="/api", tags=["extract"])

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10MB
_HARD_LIMIT = MAX_PDF_BYTES * 2  # 20MB guard against absurd Content-Length


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _read_pdf(
    upload: UploadFile | None,
    *,
    field_label: str,
    required: bool,
) -> bytes | None:
    """Validate MIME, read bytes, enforce size limits. Returns None for optional-missing."""
    if upload is None or not upload.filename:
        if required:
            raise HTTPException(status_code=400, detail="이력서 PDF를 업로드해주세요.")
        return None

    ctype = (upload.content_type or "").lower()
    if ctype and ctype != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    # Read in capped chunks to avoid accidental memory blowups.
    chunks: list[bytes] = []
    total = 0
    while True:
        part = await upload.read(64 * 1024)
        if not part:
            break
        total += len(part)
        if total > MAX_PDF_BYTES:
            raise HTTPException(
                status_code=413,
                detail="파일 크기는 10MB를 초과할 수 없습니다.",
            )
        chunks.append(part)

    data = b"".join(chunks)
    if not data:
        if required:
            raise HTTPException(status_code=400, detail="이력서 PDF를 업로드해주세요.")
        return None

    # FIXME parity: TS also rejects type==="" (empty); we treat empty content_type
    # as "unknown, accept" since FastAPI upstream clients sometimes drop it.
    _ = field_label  # noqa: F841 reserved for future error context
    return data


def _precheck_content_length(request: Request) -> None:
    cl = request.headers.get("content-length")
    if cl:
        try:
            n = int(cl)
        except ValueError:
            return
        if n > _HARD_LIMIT:
            raise HTTPException(
                status_code=413,
                detail="파일 크기는 10MB를 초과할 수 없습니다.",
            )


# ---------------------------------------------------------------------------
# POST /api/extract (non-streaming)
# ---------------------------------------------------------------------------


@router.post("/extract")
async def extract(
    request: Request,
    resume: UploadFile = File(...),
    certificate: UploadFile | None = File(None),
    _user: UserCtx = Depends(get_user),
) -> JSONResponse:
    _precheck_content_length(request)

    resume_bytes = await _read_pdf(resume, field_label="resume", required=True)
    cert_bytes = await _read_pdf(certificate, field_label="certificate", required=False)
    assert resume_bytes is not None  # required=True guaranteed

    # Run resume + cert in parallel; cert failure must not kill resume.
    if cert_bytes is not None:
        results = await asyncio.gather(
            extract_resume(resume_bytes),
            extract_certificate(cert_bytes),
            return_exceptions=True,
        )
        resume_res, cert_res = results[0], results[1]
    else:
        resume_res = await asyncio.gather(
            extract_resume(resume_bytes), return_exceptions=True
        )
        resume_res = resume_res[0]
        cert_res = None

    if isinstance(resume_res, BaseException):
        logger.exception("Resume extraction failed: %s", resume_res)
        msg = str(resume_res) if str(resume_res) else "이력서 추출 중 오류가 발생했습니다."
        raise HTTPException(status_code=500, detail=msg)

    resume_data: dict[str, Any] = resume_res  # type: ignore[assignment]

    cert_data: dict[str, Any] | None
    if cert_res is None:
        cert_data = None
    elif isinstance(cert_res, BaseException):
        logger.warning(
            "Certificate extraction failed, proceeding with resume only: %s", cert_res
        )
        cert_data = None
    else:
        cert_data = cert_res  # type: ignore[assignment]

    validated = validate_combined(resume_data, cert_data)
    errors: list[str] = validated["errors"]
    warnings: list[str] = validated["warnings"]

    if errors:
        return JSONResponse(
            status_code=422,
            content={
                "error": "\n".join(errors),
                "resumeData": resume_data,
                "certificateData": cert_data,
            },
        )

    payload: dict[str, Any] = {
        "resumeData": resume_data,
        "certificateData": cert_data,
        "warnings": warnings,
        "errors": errors,
    }
    return JSONResponse(status_code=200, content=payload)


# ---------------------------------------------------------------------------
# POST /api/extract-stream (streaming)
# ---------------------------------------------------------------------------


def _frame(kind: str, data: str) -> bytes:
    """Encode one line of the TS wire format: ``<kind>:<data>\\n``."""
    b = f"{kind}:{data}\n".encode("utf-8")
    logger.info("stream emit: kind=%s bytes=%d preview=%r", kind, len(b), data[:40])
    return b


async def _stream_generator(
    request: Request,
    resume_bytes: bytes,
    cert_bytes: bytes | None,
) -> AsyncIterator[bytes]:
    sent_fields: set[str] = set()
    resume_full = ""
    cert_full = ""
    resume_upstream: AsyncIterator[str] | None = None
    cert_upstream: AsyncIterator[str] | None = None

    async def _emit_new_fields(accumulated: str) -> list[bytes]:
        out: list[bytes] = []
        for f in extract_fields_from_stream_text(accumulated):
            if f not in sent_fields:
                sent_fields.add(f)
                out.append(_frame("field", f))
        return out

    async def _aclose(stream: AsyncIterator[str] | None) -> None:
        if stream is None:
            return
        aclose = getattr(stream, "aclose", None)
        if aclose is not None:
            try:
                await aclose()
            except Exception as exc:  # noqa: BLE001
                logger.debug("upstream aclose raised: %s", exc)

    try:
        # --- resume stream ---
        resume_upstream = extract_resume_stream(resume_bytes)
        try:
            async for chunk in resume_upstream:
                if await request.is_disconnected():
                    return
                if not chunk:
                    continue
                resume_full += chunk
                for frame in await _emit_new_fields(resume_full):
                    yield frame
        except Exception as exc:  # noqa: BLE001
            logger.exception("resume streaming error")
            msg = str(exc) if str(exc) else "이력서 스트리밍 중 오류"
            yield _frame("error", msg)
            return

        try:
            resume_data: Any = parse_json_response(resume_full)
        except Exception:
            resume_data = None
            yield _frame("status", "이력서 파싱 실패")

        # --- cert stream (optional, fail-soft) ---
        cert_data: Any = None
        if cert_bytes is not None:
            if await request.is_disconnected():
                return
            yield _frame("status", "경력증명서를 확인하고 있습니다...")

            async def _pull_next(it: AsyncIterator[str]) -> str | None:
                try:
                    return await it.__anext__()
                except StopAsyncIteration:
                    return None

            cert_upstream = extract_certificate_stream(cert_bytes)
            cert_failed = False
            first_chunk = True
            try:
                while True:
                    # Wait up to 90s for the next chunk; if Gemini hangs past that,
                    # fall back to resume-only so the client still gets a result.
                    timeout = 90.0 if first_chunk else 60.0
                    try:
                        chunk = await asyncio.wait_for(_pull_next(cert_upstream), timeout=timeout)
                    except asyncio.TimeoutError:
                        logger.warning("cert Gemini stream timed out after %.0fs; skipping cert", timeout)
                        yield _frame("status", "경력증명서 분석 시간 초과 — 이력서만 사용합니다")
                        cert_failed = True
                        break
                    first_chunk = False
                    if chunk is None:
                        break
                    if await request.is_disconnected():
                        return
                    if not chunk:
                        continue
                    cert_full += chunk
                    for frame in await _emit_new_fields(cert_full):
                        yield frame
            except Exception as exc:  # noqa: BLE001
                logger.exception("certificate streaming error")
                yield _frame("status", "경력증명서 분석 실패 — 이력서만 사용합니다")
                cert_failed = True

            if not cert_failed:
                try:
                    cert_data = parse_json_response(cert_full)
                except Exception:
                    cert_data = None
                    yield _frame("status", "경력증명서 파싱 실패")

        # --- validation + phantom filter ---
        rd = resume_data if isinstance(resume_data, dict) else None
        cd = cert_data if isinstance(cert_data, dict) else None
        validated = validate_combined(rd, cd)
        errors: list[str] = validated["errors"]
        warnings: list[str] = validated["warnings"]

        result: dict[str, Any] = {
            "resumeData": rd,
            "certificateData": cd,
            "warnings": warnings if warnings else None,
            "errors": errors if errors else None,
        }
        # Compact JSON — matches TS JSON.stringify default (no whitespace).
        yield _frame("result", json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        yield _frame("status", "추출 완료")
    except Exception as exc:  # noqa: BLE001
        logger.exception("extract-stream generator error")
        msg = str(exc) if str(exc) else "추출 중 오류"
        yield _frame("error", msg)
    finally:
        # Best-effort cancel of upstream Gemini streams on disconnect/error.
        await _aclose(resume_upstream)
        await _aclose(cert_upstream)


@router.post("/extract-stream")
async def extract_stream(
    request: Request,
    resume: UploadFile = File(...),
    certificate: UploadFile | None = File(None),
    _user: UserCtx = Depends(get_user),
) -> StreamingResponse:
    _precheck_content_length(request)

    resume_bytes = await _read_pdf(resume, field_label="resume", required=True)
    cert_bytes = await _read_pdf(certificate, field_label="certificate", required=False)
    assert resume_bytes is not None

    headers = {
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(
        _stream_generator(request, resume_bytes, cert_bytes),
        media_type="text/plain; charset=utf-8",
        headers=headers,
    )
