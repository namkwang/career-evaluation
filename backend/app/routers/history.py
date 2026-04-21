from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse

from app.core.auth import UserCtx, get_user, is_admin
from app.core.supabase import get_service_client
from app.services import storage

logger = logging.getLogger("career_evaluation.history")

router = APIRouter(prefix="/api/history", tags=["history"])

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# 60-second in-memory cache for get_all_users (avoids scanning auth.users on
# every list request — mirrors the TS userCache pattern).
_user_cache: dict | None = None
_user_cache_ts: float = 0.0


async def _get_cached_users() -> list[dict]:
    import time

    global _user_cache, _user_cache_ts  # noqa: PLW0603

    if _user_cache is not None and time.monotonic() - _user_cache_ts < 60:
        return _user_cache

    def _fetch() -> list[dict]:
        try:
            res = get_service_client().schema("public").rpc("get_all_users", {}).execute()
            return res.data or []
        except Exception as exc:  # noqa: BLE001
            logger.warning("get_all_users error: %s", exc)
            return []

    data = await asyncio.to_thread(_fetch)
    _user_cache = data
    _user_cache_ts = time.monotonic()
    return data


def _validate_uuid(id_str: str) -> str:
    """Return *id_str* if it is a valid UUID, else raise HTTP 400."""
    try:
        uuid.UUID(id_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid id") from exc
    return id_str


def _map_to_response(row: dict) -> dict:
    """Mirror the TS mapToResponse() function verbatim."""
    return {
        "id": row.get("id"),
        "applicant_name": row.get("applicant_name"),
        "applied_field": row.get("applied_field"),
        "hiring_type": row.get("hiring_type"),
        "career_year_level": row.get("career_year_level"),
        "final_career_years": row.get("final_career_years"),
        "original_career_years": row.get("original_career_years"),
        "has_resume": row.get("has_resume"),
        "has_certificate": row.get("has_certificate"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "extractionResult": row.get("extraction_result"),
        "mergeResult": row.get("merge_result"),
        "employmentResult": row.get("employment_result"),
        "finalResult": row.get("final_result"),
        "originalFinalResult": row.get("original_final_result"),
        "appliedEdits": row.get("applied_edits"),
    }


# ---------------------------------------------------------------------------
# GET /api/history  — list all applicants
# ---------------------------------------------------------------------------


@router.get("")
async def list_history(user: UserCtx = Depends(get_user)) -> JSONResponse:
    admin = await is_admin(user.user_id)

    def _query() -> list[dict]:
        q = (
            get_service_client()
            .from_("applicants")
            .select(
                "id, applicant_name, applied_field, hiring_type, career_year_level,"
                " final_career_years, original_career_years, created_at, updated_at, user_id"
            )
            .order("created_at", desc=True)
        )
        if not admin:
            q = q.eq("user_id", user.user_id)
        res = q.execute()
        return res.data or []

    applicants: list[dict] = await asyncio.to_thread(_query)

    # Enrich with analyst_name (user display name / email)
    user_ids = list({a["user_id"] for a in applicants if a.get("user_id")})
    user_map: dict[str, dict[str, str]] = {}

    if user_ids:
        users = await _get_cached_users()
        for u in users:
            if u.get("id") in user_ids:
                meta = u.get("raw_user_meta_data") or {}
                user_map[u["id"]] = {
                    "name": meta.get("name", ""),
                    "email": u.get("email", ""),
                }

    enriched = [
        {
            **a,
            "analyst_name": (
                user_map.get(a.get("user_id", ""), {}).get("name")
                or user_map.get(a.get("user_id", ""), {}).get("email")
                or ""
            ),
        }
        for a in applicants
    ]

    return JSONResponse(content={"applicants": enriched})


# ---------------------------------------------------------------------------
# POST /api/history  — create or update applicant
# ---------------------------------------------------------------------------


@router.post("")
async def create_or_update_history(
    request: Request,
    user: UserCtx = Depends(get_user),
) -> JSONResponse:
    import time as _time

    now = _time.strftime("%Y-%m-%dT%H:%M:%S.000Z", _time.gmtime())

    # Accept both multipart/form-data and application/json (mirrors TS logic)
    content_type = request.headers.get("content-type", "")
    resume_bytes: bytes | None = None
    cert_bytes: bytes | None = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw_data = form.get("data")
        if not isinstance(raw_data, str):
            raise HTTPException(status_code=400, detail="multipart must include a 'data' JSON field")
        body: dict = json.loads(raw_data)

        resume_field = form.get("resume")
        cert_field = form.get("certificate")

        # Validate and read PDF files
        for label, field_val in (("resume", resume_field), ("certificate", cert_field)):
            if field_val is None or not hasattr(field_val, "read"):
                continue
            file_bytes: bytes = await field_val.read()
            if not file_bytes:
                continue
            ct = getattr(field_val, "content_type", "") or ""
            if ct != "application/pdf":
                raise HTTPException(status_code=415, detail="PDF 파일만 업로드 가능합니다.")
            if len(file_bytes) > MAX_PDF_BYTES:
                raise HTTPException(status_code=413, detail="파일 크기는 10MB를 초과할 수 없습니다.")
            if label == "resume":
                resume_bytes = file_bytes
            else:
                cert_bytes = file_bytes
    else:
        body = await request.json()

    # Validate / generate id
    provided_id: str | None = body.get("id")
    if provided_id is not None and provided_id != "":
        _validate_uuid(provided_id)
        applicant_id = provided_id
    else:
        applicant_id = str(uuid.uuid4())

    # Ownership check for updates
    created_at = now

    def _fetch_existing() -> dict | None:
        res = (
            get_service_client()
            .from_("applicants")
            .select("created_at, user_id")
            .eq("id", applicant_id)
            .maybe_single()
            .execute()
        )
        return res.data if res else None

    existing = await asyncio.to_thread(_fetch_existing)
    if existing:
        created_at = existing.get("created_at", now)
        if existing.get("user_id") != user.user_id:
            if not await is_admin(user.user_id):
                raise HTTPException(status_code=403, detail="forbidden")

    # Upload PDFs in parallel (best-effort — mirrors TS behaviour)
    resume_uploaded = False
    cert_uploaded = False

    async def _upload_resume() -> None:
        nonlocal resume_uploaded
        if resume_bytes:
            try:
                await storage.upload_pdf(applicant_id, "resume", resume_bytes)
                resume_uploaded = True
            except Exception as exc:  # noqa: BLE001
                logger.warning("resume upload failed for %s: %s", applicant_id, exc)

    async def _upload_cert() -> None:
        nonlocal cert_uploaded
        if cert_bytes:
            try:
                await storage.upload_pdf(applicant_id, "certificate", cert_bytes)
                cert_uploaded = True
            except Exception as exc:  # noqa: BLE001
                logger.warning("certificate upload failed for %s: %s", applicant_id, exc)

    await asyncio.gather(_upload_resume(), _upload_cert())

    has_resume = bool(body.get("has_resume") or resume_uploaded)
    has_certificate = bool(body.get("has_certificate") or cert_uploaded)

    record = {
        "id": applicant_id,
        "user_id": user.user_id,
        "applicant_name": body.get("applicant_name") or "이름 미상",
        "applied_field": body.get("applied_field") or "",
        "hiring_type": body.get("hiring_type") or "",
        "career_year_level": body.get("career_year_level"),
        "final_career_years": body.get("final_career_years"),
        "original_career_years": (
            body.get("original_career_years")
            if body.get("original_career_years") is not None
            else body.get("final_career_years")
        ),
        "has_resume": has_resume,
        "has_certificate": has_certificate,
        "created_at": created_at,
        "updated_at": now,
        # TS POST body uses camelCase for these fields
        "extraction_result": body.get("extractionResult"),
        "merge_result": body.get("mergeResult"),
        "employment_result": body.get("employmentResult"),
        "final_result": body.get("finalResult"),
        "original_final_result": (
            body.get("originalFinalResult")
            if body.get("originalFinalResult") is not None
            else body.get("finalResult")
        ),
        "applied_edits": body.get("appliedEdits"),
    }

    def _upsert() -> None:
        res = get_service_client().from_("applicants").upsert(record).execute()
        if hasattr(res, "error") and res.error:
            raise HTTPException(status_code=500, detail=res.error.message)

    await asyncio.to_thread(_upsert)

    return JSONResponse(content={"id": applicant_id, "saved": True})


# ---------------------------------------------------------------------------
# GET /api/history/{id}  — detail
# ---------------------------------------------------------------------------


@router.get("/{id}")
async def get_history(id: str, user: UserCtx = Depends(get_user)) -> JSONResponse:
    _validate_uuid(id)
    admin = await is_admin(user.user_id)

    def _fetch() -> dict | None:
        q = get_service_client().from_("applicants").select("*").eq("id", id)
        if not admin:
            q = q.eq("user_id", user.user_id)
        res = q.maybe_single().execute()
        return res.data if res else None

    row = await asyncio.to_thread(_fetch)
    if not row:
        raise HTTPException(status_code=404, detail="not found")

    return JSONResponse(content=_map_to_response(row))


# ---------------------------------------------------------------------------
# DELETE /api/history/{id}
# ---------------------------------------------------------------------------


@router.delete("/{id}")
async def delete_history(id: str, user: UserCtx = Depends(get_user)) -> JSONResponse:
    _validate_uuid(id)
    admin = await is_admin(user.user_id)

    def _delete() -> list[dict]:
        q = get_service_client().from_("applicants").delete(returning="representation").eq("id", id)
        if not admin:
            q = q.eq("user_id", user.user_id)
        res = q.execute()
        return res.data or []

    deleted_rows = await asyncio.to_thread(_delete)
    if not deleted_rows:
        raise HTTPException(status_code=404, detail="not found")

    # Best-effort: remove both PDFs from storage
    await asyncio.gather(
        storage.delete_pdf(id, "resume"),
        storage.delete_pdf(id, "certificate"),
    )

    return JSONResponse(content={"deleted": True})


# ---------------------------------------------------------------------------
# GET /api/history/{id}/file/{file_type}  — serve PDF bytes
# ---------------------------------------------------------------------------


@router.get("/{id}/file/{file_type}")
async def serve_file(
    id: str,
    file_type: str,
    user: UserCtx = Depends(get_user),
) -> Response:
    _validate_uuid(id)

    if file_type not in ("resume", "certificate"):
        raise HTTPException(status_code=400, detail="invalid type")

    # Ownership check
    def _fetch_owner() -> dict | None:
        res = (
            get_service_client()
            .from_("applicants")
            .select("user_id")
            .eq("id", id)
            .maybe_single()
            .execute()
        )
        return res.data if res else None

    row = await asyncio.to_thread(_fetch_owner)
    if not row:
        raise HTTPException(status_code=404, detail="not found")

    if row.get("user_id") != user.user_id:
        if not await is_admin(user.user_id):
            raise HTTPException(status_code=403, detail="forbidden")

    try:
        pdf_bytes = await storage.download_pdf(id, file_type)
    except Exception as exc:  # noqa: BLE001
        logger.warning("download_pdf failed for %s/%s: %s", id, file_type, exc)
        raise HTTPException(status_code=404, detail="file not found") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{file_type}.pdf"',
            "Content-Security-Policy": "sandbox",
        },
    )
