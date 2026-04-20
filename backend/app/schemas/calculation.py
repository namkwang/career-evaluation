from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CareerDetail(BaseModel):
    model_config = ConfigDict(extra="allow")

    index: int | None = None
    company_name: str
    project_name: str | None = None
    period_start: str
    period_end: str | None = None
    source: str = "certificate"

    company_category: str | None = None
    is_small_company: bool | None = None
    ranking_year: int | None = None
    ranking_position: int | None = None
    company_category_reason: str | None = None
    employment_type: str
    employment_type_reason: str | None = None

    continuous_group_id: str | None = None
    applied_company_category: str | None = None
    military_engineer: bool | None = None

    base_rate: float
    contract_adjustment: bool = False
    contract_exception: bool = False
    final_rate: float
    rate_note: str | None = None
    working_days: int
    recognized_days: int

    # set when a duplicate period is detected and days are trimmed
    overlap_excluded: bool | None = None
    overlap_days: int | None = None


class CalculationSummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    total_working_days: int
    total_recognized_days: int
    total_recognized_years: float
    education_level: str
    education_deduction_years: float
    education_note: str
    final_career_years: float
    career_year_level: int


class RateBreakdownItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    days: int
    description: str


class CalculateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    # mergeResult holds merged_careers + education + other fields
    mergeResult: dict
    hiring_type: str = "일반"


class CalculateResultBody(BaseModel):
    model_config = ConfigDict(extra="allow")

    applicant_name: str
    applied_field: str
    hiring_type: str
    career_details: list[CareerDetail]
    calculation_summary: CalculationSummary
    # key is e.g. "rate_100", "rate_80", "rate_0"
    rate_breakdown: dict[str, RateBreakdownItem]
    remaining_flags: list[dict]


class CalculateResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    calculateResult: CalculateResultBody
