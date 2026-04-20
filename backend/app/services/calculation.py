"""Pure calculation service for /api/calculate.

Byte-level parity port of src/app/api/calculate/route.ts. No FastAPI imports.

The frontend consumes numeric fields (final_career_years, final_rate to 1
decimal, recognized_days as integers) directly, so the arithmetic here must
match the TS implementation exactly. Notable parity details:

* JS ``Math.round`` rounds half to +infinity; Python's ``round`` is bankers.
  We implement :func:`js_round` and :func:`js_round_1` to mimic JS.
* ``Math.floor`` maps to :func:`math.floor` (toward -infinity, integer).
* ``Date.now()`` sentinel (in-progress period) is injectable as ``now_ms``.
* ``Number.isFinite`` / NaN defenses are ported via :func:`safe_days`.
"""

from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("career_evaluation.calculation")

# JS: /\(주\)|㈜|주식회사|\s/g
_NORM_NAME_RE = re.compile(r"\(주\)|㈜|주식회사|\s")


def norm_name(s: str | None) -> str:
    if not s:
        return ""
    return _NORM_NAME_RE.sub("", s)


def js_round(x: float) -> int:
    """JS Math.round semantics: round half toward +infinity.

    Python's round(0.5) -> 0 (banker's rounding). JS Math.round(0.5) -> 1.
    """
    return math.floor(x + 0.5)


def js_round_1(x: float) -> float:
    """Equivalent of ``Math.round(x * 10) / 10`` in JS."""
    return js_round(x * 10) / 10


def safe_days(v: Any) -> float:
    """Port of safeDays: returns max(0, Number(n)) or 0 if non-finite.

    TS ``safeDays`` does NOT floor/round; callers decide when to floor. We
    return a float so downstream ``math.floor`` applies the same way as
    ``Math.floor`` in TS.
    """
    if v is None:
        return 0.0
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(n):
        return 0.0
    if n < 0:
        return 0.0
    return n


def get_base_rate(
    category: str,
    is_small: bool | None,
    military_engineer: bool | None,
) -> int:
    """Port of getBaseRate."""
    if category == "military":
        return 20 if military_engineer else 0
    if category == "other":
        return 0
    if is_small:
        return 64
    if category == "general_top100":
        return 100
    if category == "general_outside100":
        return 80
    if category == "specialty":
        return 80
    if category == "construction_related":
        return 64
    return 0


def calc_final_rate(
    base_rate: float,
    employment_type: str,
    category: str,
    hiring_type: str,
) -> dict[str, Any]:
    """Port of calcFinalRate.

    Returns ``{"final_rate", "contract_adj", "note"}``.
    """
    if employment_type == "contract":
        if (
            hiring_type in ("전문직", "현채직", "professional", "site_hire")
            and category == "general_top100"
        ):
            return {
                "final_rate": float(base_rate),
                "contract_adj": False,
                "note": "전문직/현채직 채용 예외 - 계약직 보정 미적용",
            }
        adjusted = js_round_1(base_rate * 0.8)
        return {
            "final_rate": adjusted,
            "contract_adj": True,
            "note": "계약직 보정 ×0.8",
        }
    if employment_type == "unknown":
        return {
            "final_rate": float(base_rate),
            "contract_adj": False,
            "note": "고용형태 미확인 - 계약직 보정 미적용",
        }
    return {
        "final_rate": float(base_rate),
        "contract_adj": False,
        "note": "정규직",
    }


# Compile once; order matters — first match wins, mirroring TS if/else chain.
_DEGREE_RE_PHD = re.compile(r"박사")
_DEGREE_RE_MASTER = re.compile(r"석사")
_DEGREE_RE_BACHELOR = re.compile(r"학사|4년제")
_DEGREE_RE_EXCLUDE_BACHELOR = re.compile(r"중퇴|전문")
_DEGREE_RE_3YR = re.compile(r"3년제|전문학사.*3년")
_DEGREE_RE_2YR = re.compile(r"전문학사|2년제|전문대")
_DEGREE_RE_HS = re.compile(r"고졸|고등학교")

_DEDUCTION_MAP: dict[str, int] = {
    "박사": 0,
    "석사": 0,
    "학사": 0,
    "3년제 전문학사": 1,
    "전문학사": 2,
    "고졸": 4,
}


def calc_education_deduction(education: list[dict[str, Any]] | None) -> dict[str, Any]:
    """Port of calcEducationDeduction."""
    if not education:
        return {
            "education_level": "학력 정보 없음",
            "education_deduction_years": 4,
            "education_note": "학력 정보 없음 — 고졸 이하로 간주 (4년 차감)",
        }

    best_degree = "고졸"
    best_score = 0
    best_note = ""

    for edu in education:
        raw = edu.get("degree") or ""
        normalized = ""
        score = 0

        if _DEGREE_RE_PHD.search(raw):
            normalized, score = "박사", 5
        elif _DEGREE_RE_MASTER.search(raw):
            normalized, score = "석사", 4
        elif _DEGREE_RE_BACHELOR.search(raw) and not _DEGREE_RE_EXCLUDE_BACHELOR.search(raw):
            normalized, score = "학사", 3
        elif _DEGREE_RE_3YR.search(raw):
            normalized, score = "3년제 전문학사", 2
        elif _DEGREE_RE_2YR.search(raw):
            normalized, score = "전문학사", 1
        elif _DEGREE_RE_HS.search(raw):
            normalized, score = "고졸", 0

        if score > best_score:
            best_score = score
            best_degree = normalized
            school = edu.get("school_name") or ""
            dept = edu.get("department") or ""
            best_note = f"{school} {dept} ({raw})".strip()

    deduction = _DEDUCTION_MAP.get(best_degree, 4)
    level_label = best_degree or "고졸 이하"

    return {
        "education_level": level_label,
        "education_deduction_years": deduction,
        "education_note": best_note or level_label,
    }


def _parse_date_ms(s: Any) -> float:
    """Port of ``new Date(s).getTime()``.

    Returns NaN (math.nan) for unparseable inputs so callers can ``isfinite``-check.
    """
    if s is None:
        return math.nan
    if not isinstance(s, str):
        return math.nan
    try:
        # fromisoformat handles "YYYY-MM-DD" and full ISO strings.
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            # JS ``new Date('YYYY-MM-DD')`` treats as UTC.
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp() * 1000
    except ValueError:
        return math.nan


def _default_now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def run_calculation(
    merge_result: dict[str, Any],
    hiring_type: str | None,
    *,
    now_ms: int | None = None,
) -> dict[str, Any]:
    """Top-level port of the POST handler body in route.ts.

    Returns the ``result`` dict (the thing that becomes ``{calculateResult: ...}``
    in the response).
    """
    input_careers: list[dict[str, Any]] = list(merge_result.get("merged_careers") or [])
    education: list[dict[str, Any]] = list(merge_result.get("education") or [])
    hiring_type = hiring_type or "일반"
    now_ms_val = now_ms if now_ms is not None else _default_now_ms()

    # --- 1. merged_careers → career_details 변환 (1:1 대응) ---
    career_details: list[dict[str, Any]] = []
    for c in input_careers:
        cat = c.get("applied_company_category") or c.get("company_category") or "other"
        emp = c.get("employment_type") or "unknown"
        small = c.get("is_small_company")
        mil_eng = c.get("military_engineer")

        base_rate = get_base_rate(cat, small, mil_eng)
        rate = calc_final_rate(base_rate, emp, cat, hiring_type)
        final_rate = rate["final_rate"]

        # TS: safeDays returns Number (potentially float), but Math.floor is
        # applied for recognized_days. Frontend feeds integer day counts in
        # practice; the response schema also requires int. Coerce via floor to
        # keep parity with ``Math.floor`` on non-integer inputs.
        working_days_raw = safe_days(c.get("working_days"))
        working_days = math.floor(working_days_raw)
        recognized_days = math.floor(working_days_raw * final_rate / 100)

        career_details.append(
            {
                "index": c.get("index"),
                "company_name": c.get("company_name"),
                "project_name": c.get("project_name"),
                "period_start": c.get("period_start"),
                "period_end": c.get("period_end"),
                "source": c.get("source") or "certificate",
                "company_category": c.get("company_category"),
                "is_small_company": small,
                "ranking_year": c.get("ranking_year"),
                "ranking_position": c.get("ranking_position"),
                "company_category_reason": c.get("company_category_reason"),
                "employment_type": emp,
                "employment_type_reason": c.get("employment_type_reason"),
                "continuous_group_id": None,
                "applied_company_category": cat,
                "military_engineer": mil_eng,
                "base_rate": base_rate,
                "contract_adjustment": rate["contract_adj"],
                "contract_exception": False,
                "final_rate": final_rate,
                "rate_note": rate["note"],
                "working_days": working_days,
                "recognized_days": recognized_days,
            }
        )

    # --- 2. 기간 중복 감지 + 보정 ---
    sorted_for_overlap = sorted(
        career_details, key=lambda c: c.get("period_start") or ""
    )
    covered_by_company: dict[str, list[tuple[float, float]]] = {}

    for career in sorted_for_overlap:
        key = norm_name(career.get("company_name") or "")
        covered = covered_by_company.setdefault(key, [])

        start = _parse_date_ms(career.get("period_start"))
        end_raw = career.get("period_end")
        end = _parse_date_ms(end_raw) if end_raw else float(now_ms_val)

        if math.isfinite(start) and math.isfinite(end):
            overlap_days = 0
            for cs, ce in covered:
                overlap_start = max(start, cs)
                overlap_end = min(end, ce)
                if overlap_start <= overlap_end:
                    # Match TS: Math.round((overlapEnd - overlapStart) / 86400000) + 1
                    overlap_days += js_round((overlap_end - overlap_start) / 86_400_000) + 1

            if overlap_days > 0 and overlap_days >= career["working_days"]:
                career["recognized_days"] = 0
                career["final_rate"] = 0
                career["overlap_excluded"] = True
                career["rate_note"] = (career.get("rate_note") or "") + " [기간 중복 제외]"
            elif overlap_days > 0:
                effective_days = safe_days(career["working_days"]) - overlap_days
                career["recognized_days"] = math.floor(
                    effective_days * career["final_rate"] / 100
                )
                career["overlap_days"] = overlap_days
                career["rate_note"] = (
                    (career.get("rate_note") or "") + f" [기간 중복 {overlap_days}일 차감]"
                )

            covered.append((start, end))

    # --- 3. 3개월(90일) 미만 경력 제외 (회사 재직기간 합산 기준) ---
    company_total_days: dict[str, float] = {}
    for career in career_details:
        key = norm_name(career.get("company_name") or "")
        company_total_days[key] = company_total_days.get(key, 0) + career["working_days"]

    for career in career_details:
        key = norm_name(career.get("company_name") or "")
        total_days = company_total_days.get(key, 0)
        if total_days < 90:
            career["recognized_days"] = 0
            career["final_rate"] = 0
            career["rate_note"] = (career.get("rate_note") or "") + " [3개월 미만 경력 제외]"

    # --- 4. 합계 계산 ---
    total_working_days = sum(safe_days(c["working_days"]) for c in career_details)
    total_recognized = sum(safe_days(c["recognized_days"]) for c in career_details)
    total_recognized_years = js_round_1(total_recognized / 365) if total_recognized else 0.0

    # NaN/Infinity defense — sum() over safe_days already yields finite, but mirror TS.
    if not math.isfinite(total_recognized):
        total_recognized = 0
    if not math.isfinite(total_recognized_years):
        total_recognized_years = 0.0

    # --- 5. 학력 차감 ---
    edu_result = calc_education_deduction(education)
    final_career_years = max(
        0.0,
        js_round_1(total_recognized_years - edu_result["education_deduction_years"]),
    )
    career_year_level = math.floor(final_career_years)

    # --- 6. 인정률별 요약 ---
    rate_groups: dict[str, dict[str, Any]] = {}
    for c in career_details:
        if c["recognized_days"] <= 0:
            continue
        # JS: `rate_${String(c.final_rate).replace(".", "_")}`
        # Python str(80.0) = "80.0"; JS String(80) = "80". Preserve TS by
        # stripping trailing ".0" so integer rates key as ``rate_80``.
        fr = c["final_rate"]
        if isinstance(fr, float) and fr.is_integer():
            fr_str = str(int(fr))
        else:
            fr_str = str(fr)
        rate_key = f"rate_{fr_str.replace('.', '_')}"
        bucket = rate_groups.setdefault(rate_key, {"days": 0, "companies": []})
        bucket["days"] += c["recognized_days"]
        name = c.get("company_name")
        if name and name not in bucket["companies"]:
            bucket["companies"].append(name)

    zero_days = sum(
        c["working_days"] for c in career_details if c["recognized_days"] == 0
    )
    if zero_days > 0:
        rate_groups["rate_0"] = {"days": zero_days, "companies": ["제외 경력"]}

    rate_breakdown: dict[str, dict[str, Any]] = {}
    for key, val in rate_groups.items():
        rate_breakdown[key] = {
            "days": val["days"],
            "description": ", ".join(val["companies"]),
        }

    personal_info = merge_result.get("personal_info") or {}
    applicant_name = (
        merge_result.get("applicant_name")
        or personal_info.get("name_korean")
        or ""
    )

    result = {
        "applicant_name": applicant_name,
        "applied_field": merge_result.get("applied_field") or "",
        "hiring_type": hiring_type,
        "career_details": career_details,
        "calculation_summary": {
            "total_working_days": total_working_days,
            "total_recognized_days": total_recognized,
            "total_recognized_years": total_recognized_years,
            "education_level": edu_result["education_level"],
            "education_deduction_years": edu_result["education_deduction_years"],
            "education_note": edu_result["education_note"],
            "final_career_years": final_career_years,
            "career_year_level": career_year_level,
        },
        "rate_breakdown": rate_breakdown,
        "remaining_flags": merge_result.get("verification_summary") or [],
    }

    return result
