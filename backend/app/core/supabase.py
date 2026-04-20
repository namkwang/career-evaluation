from __future__ import annotations

import logging
from functools import lru_cache

from supabase import Client, ClientOptions, create_client

from app.core.config import get_settings

logger = logging.getLogger("career_evaluation.supabase")

STORAGE_BUCKET = "career-documents"


@lru_cache(maxsize=1)
def get_service_client() -> Client:
    s = get_settings()
    return create_client(
        s.next_public_supabase_url,
        s.supabase_service_role_key,
        options=ClientOptions(schema="career_evaluation"),
    )


@lru_cache(maxsize=1)
def get_anon_client() -> Client:
    s = get_settings()
    return create_client(
        s.next_public_supabase_url,
        s.next_public_supabase_anon_key,
        options=ClientOptions(schema="career_evaluation"),
    )


@lru_cache(maxsize=1)
def get_common_schema_client() -> Client:
    s = get_settings()
    return create_client(
        s.next_public_supabase_url,
        s.supabase_service_role_key,
        options=ClientOptions(schema="common"),
    )
