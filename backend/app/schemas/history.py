from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class HistoryListItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    applicant_name: str
    applied_field: str | None = None
    hiring_type: str | None = None
    career_year_level: int | None = None
    final_career_years: float | None = None
    original_career_years: float | None = None
    created_at: str
    updated_at: str
    user_id: str | None = None
    analyst_name: str | None = None


class Applicant(BaseModel):
    """Full applicant record returned by GET /api/history/{id}."""

    model_config = ConfigDict(extra="allow")

    id: str
    applicant_name: str
    applied_field: str | None = None
    hiring_type: str | None = None
    career_year_level: int | None = None
    final_career_years: float | None = None
    original_career_years: float | None = None
    has_resume: bool = False
    has_certificate: bool = False
    created_at: str
    updated_at: str
    # camelCase preserved — matches the TS mapToResponse() wire format
    extractionResult: dict | None = None
    mergeResult: dict | None = None
    employmentResult: dict | None = None
    finalResult: dict | None = None
    originalFinalResult: dict | None = None
    appliedEdits: dict | None = None


class HistoryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = None
    applicant_name: str = "이름 미상"
    applied_field: str | None = None
    hiring_type: str | None = None
    career_year_level: int | None = None
    final_career_years: float | None = None
    original_career_years: float | None = None
    has_resume: bool = False
    has_certificate: bool = False
    extractionResult: dict | None = None
    mergeResult: dict | None = None
    employmentResult: dict | None = None
    finalResult: dict | None = None
    originalFinalResult: dict | None = None
    appliedEdits: dict | None = None
