from __future__ import annotations

import asyncio
import logging

from app.core.supabase import STORAGE_BUCKET, get_service_client

logger = logging.getLogger("career_evaluation.storage")


async def upload_pdf(applicant_id: str, file_name: str, data: bytes) -> None:
    """Upload *data* to ``{applicant_id}/{file_name}.pdf`` in the storage bucket."""
    path = f"{applicant_id}/{file_name}.pdf"

    def _upload() -> None:
        get_service_client().storage.from_(STORAGE_BUCKET).upload(
            path,
            data,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )

    await asyncio.to_thread(_upload)
    logger.debug("uploaded %s", path)


async def delete_pdf(applicant_id: str, file_name: str) -> None:
    """Remove ``{applicant_id}/{file_name}.pdf`` from storage; swallow 404."""
    path = f"{applicant_id}/{file_name}.pdf"

    def _remove() -> None:
        try:
            get_service_client().storage.from_(STORAGE_BUCKET).remove([path])
        except Exception as exc:  # noqa: BLE001
            # Storage 404 and similar errors are non-fatal for delete operations.
            logger.debug("delete_pdf swallowed error for %s: %s", path, exc)

    await asyncio.to_thread(_remove)


async def download_pdf(applicant_id: str, file_name: str) -> bytes:
    """Download ``{applicant_id}/{file_name}.pdf`` and return raw bytes."""
    path = f"{applicant_id}/{file_name}.pdf"

    def _download() -> bytes:
        return get_service_client().storage.from_(STORAGE_BUCKET).download(path)

    return await asyncio.to_thread(_download)
