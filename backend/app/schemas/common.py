from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class ApplicationOptions(BaseModel):
    model_config = ConfigDict(extra="allow")

    applied_field: Literal["건축", "토목"] | str
    hiring_type: Literal["일반", "전문직", "현채직"] | str


class RankingMatch(BaseModel):
    model_config = ConfigDict(extra="allow")

    company_name: str
    year: int
    rank: int
    matched_name: str


class WorkHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    period_start: str
    period_end: str | None = None
    company_name: str
    company_name_current: str | None = None
