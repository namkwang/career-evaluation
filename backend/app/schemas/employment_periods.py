from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class EPProject(BaseModel):
    """A single project/career entry used in employment-period analysis."""

    model_config = ConfigDict(extra="allow")

    index: int
    company_name: str
    project_name: str | None = None
    period_start: str
    period_end: str
    working_days: int
    position_raw: str | None = None
    continuous_group_id: str | None = None
    source: str


class EmploymentPeriod(BaseModel):
    """A contiguous employment span at one company, aggregating one or more EPProject entries."""

    model_config = ConfigDict(extra="allow")

    company_name: str
    period_start: str
    period_end: str | None = None
    # True when period_end is null/absent (still employed)
    is_current: bool = False
    projects: list[EPProject] = []
