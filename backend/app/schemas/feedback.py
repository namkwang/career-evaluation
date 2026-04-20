from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class FeedbackCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    category: str = "improvement"
    content: str
    applicant_id: str | None = None
    applicant_name: str | None = None
    page: str | None = None
    user_name: str | None = None


class Feedback(BaseModel):
    """Full feedback row as stored in Supabase."""

    model_config = ConfigDict(extra="allow")

    id: str
    category: str
    content: str
    applicant_id: str | None = None
    applicant_name: str | None = None
    page: str | None = None
    user_name: str | None = None
    user_id: str
    created_at: str
