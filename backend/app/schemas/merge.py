from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.schemas.common import ApplicationOptions, RankingMatch
from app.schemas.extraction import ExtractionResult


class VerificationSummaryItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    flag_type: str
    related_career_index: int | None = None
    description: str
    requires_interview: bool = False


class MergedCareer(BaseModel):
    model_config = ConfigDict(extra="allow")

    index: int
    company_name: str
    project_name: str | None = None
    period_start: str
    period_end: str | None = None
    working_days: int = 0
    source: str
    company_category: str | None = None
    applied_company_category: str | None = None
    is_small_company: bool | None = None
    ranking_year: int | None = None
    ranking_position: int | None = None
    company_category_reason: str | None = None
    employment_type: str | None = None
    employment_type_reason: str | None = None
    continuous_group_id: str | None = None
    period_supplemented: bool = False


class MergeRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    resumeData: dict
    certificateData: dict | None = None
    applied_field: str
    hiring_type: str


class MergeResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    mergeResult: dict
    rankingMatches: list[RankingMatch] = []
