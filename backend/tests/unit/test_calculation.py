"""Unit tests for app.services.calculation — byte-level TS parity."""

from __future__ import annotations

import math

import pytest

from app.services.calculation import (
    calc_education_deduction,
    calc_final_rate,
    get_base_rate,
    js_round,
    js_round_1,
    norm_name,
    run_calculation,
    safe_days,
)


# ---------------------------------------------------------------------------
# js_round / js_round_1 — TS parity
# ---------------------------------------------------------------------------


class TestJsRound:
    def test_half_rounds_toward_positive_infinity(self) -> None:
        # JS Math.round(0.5) == 1; Python round(0.5) == 0 (bankers).
        assert js_round(0.5) == 1
        assert js_round(1.5) == 2
        assert js_round(2.5) == 3

    def test_negative_halves(self) -> None:
        # JS Math.round(-0.5) === 0 (rounds toward +∞), Math.round(-1.5) === -1.
        assert js_round(-0.5) == 0
        assert js_round(-1.5) == -1

    def test_js_round_1_on_contract_adjustments(self) -> None:
        # 80 * 0.8 = 64 → 64.0; 100 * 0.8 = 80 → 80.0
        assert js_round_1(80 * 0.8) == 64.0
        assert js_round_1(100 * 0.8) == 80.0
        assert js_round_1(64 * 0.8) == 51.2


# ---------------------------------------------------------------------------
# get_base_rate — every category × is_small × military_engineer combo
# ---------------------------------------------------------------------------


class TestGetBaseRate:
    @pytest.mark.parametrize(
        "category, is_small, mil_eng, expected",
        [
            ("general_top100", False, None, 100),
            ("general_top100", None, None, 100),
            ("general_top100", True, None, 64),
            ("general_outside100", False, None, 80),
            ("general_outside100", True, None, 64),
            ("specialty", False, None, 80),
            ("specialty", True, None, 64),
            ("construction_related", False, None, 64),
            ("construction_related", True, None, 64),
            ("military", False, True, 20),
            ("military", True, True, 20),
            ("military", False, False, 0),
            ("military", False, None, 0),
            ("other", False, None, 0),
            ("other", True, None, 0),
            ("unknown_category", False, None, 0),
            ("unknown_category", True, None, 64),
        ],
    )
    def test_matrix(
        self, category: str, is_small: bool | None, mil_eng: bool | None, expected: int
    ) -> None:
        assert get_base_rate(category, is_small, mil_eng) == expected


# ---------------------------------------------------------------------------
# calc_final_rate — regular vs contract, top100+전문직 exception
# ---------------------------------------------------------------------------


class TestCalcFinalRate:
    def test_regular_employee_keeps_base_rate(self) -> None:
        r = calc_final_rate(100, "regular", "general_top100", "일반")
        assert r["final_rate"] == 100
        assert r["contract_adj"] is False
        assert r["note"] == "정규직"

    def test_unknown_employment_keeps_base_rate(self) -> None:
        r = calc_final_rate(80, "unknown", "general_outside100", "일반")
        assert r["final_rate"] == 80
        assert r["contract_adj"] is False
        assert "미확인" in r["note"]

    def test_contract_general_applies_0_8(self) -> None:
        r = calc_final_rate(80, "contract", "general_outside100", "일반")
        assert r["final_rate"] == 64.0
        assert r["contract_adj"] is True

    def test_contract_top100_with_jeonmunjik_exception(self) -> None:
        r = calc_final_rate(100, "contract", "general_top100", "전문직")
        assert r["final_rate"] == 100
        assert r["contract_adj"] is False
        assert "예외" in r["note"]

    def test_contract_top100_with_hyeonchaejik_exception(self) -> None:
        r = calc_final_rate(100, "contract", "general_top100", "현채직")
        assert r["final_rate"] == 100
        assert r["contract_adj"] is False

    def test_contract_top100_with_english_aliases(self) -> None:
        r1 = calc_final_rate(100, "contract", "general_top100", "professional")
        r2 = calc_final_rate(100, "contract", "general_top100", "site_hire")
        assert r1["final_rate"] == 100 and r1["contract_adj"] is False
        assert r2["final_rate"] == 100 and r2["contract_adj"] is False

    def test_contract_top100_ordinary_hiring_still_adjusts(self) -> None:
        # 일반 hiring_type → exception does NOT apply → contract adj kicks in.
        r = calc_final_rate(100, "contract", "general_top100", "일반")
        assert r["final_rate"] == 80.0
        assert r["contract_adj"] is True

    def test_contract_specialty_no_exception(self) -> None:
        # Exception only for general_top100 × 전문직/현채직 — not for specialty.
        r = calc_final_rate(80, "contract", "specialty", "전문직")
        assert r["final_rate"] == 64.0
        assert r["contract_adj"] is True


# ---------------------------------------------------------------------------
# calc_education_deduction
# ---------------------------------------------------------------------------


class TestCalcEducationDeduction:
    def test_no_education_assumes_high_school(self) -> None:
        r = calc_education_deduction([])
        assert r["education_level"] == "학력 정보 없음"
        assert r["education_deduction_years"] == 4

    def test_none_assumes_high_school(self) -> None:
        r = calc_education_deduction(None)
        assert r["education_deduction_years"] == 4

    def test_phd_zero(self) -> None:
        r = calc_education_deduction(
            [{"degree": "박사", "school_name": "A", "department": "B"}]
        )
        assert r["education_level"] == "박사"
        assert r["education_deduction_years"] == 0

    def test_master_zero(self) -> None:
        r = calc_education_deduction([{"degree": "석사"}])
        assert r["education_level"] == "석사"
        assert r["education_deduction_years"] == 0

    def test_bachelor_zero(self) -> None:
        r = calc_education_deduction([{"degree": "학사"}])
        assert r["education_level"] == "학사"
        assert r["education_deduction_years"] == 0

    def test_bachelor_4yr_variant(self) -> None:
        r = calc_education_deduction([{"degree": "4년제 졸업"}])
        assert r["education_level"] == "학사"
        assert r["education_deduction_years"] == 0

    def test_bachelor_excludes_dropouts(self) -> None:
        # 학사 중퇴 → not bachelor; falls through to no match → stays 고졸 default.
        r = calc_education_deduction([{"degree": "학사 중퇴"}])
        assert r["education_deduction_years"] == 4

    def test_3yr_specialist_one(self) -> None:
        r = calc_education_deduction([{"degree": "3년제 전문학사"}])
        assert r["education_level"] == "3년제 전문학사"
        assert r["education_deduction_years"] == 1

    def test_2yr_specialist_two(self) -> None:
        r = calc_education_deduction([{"degree": "전문학사"}])
        assert r["education_level"] == "전문학사"
        assert r["education_deduction_years"] == 2

    def test_high_school_four(self) -> None:
        r = calc_education_deduction([{"degree": "고졸"}])
        assert r["education_level"] == "고졸"
        assert r["education_deduction_years"] == 4

    def test_picks_highest_degree(self) -> None:
        r = calc_education_deduction(
            [
                {"degree": "고졸", "school_name": "HS"},
                {"degree": "학사", "school_name": "U"},
                {"degree": "석사", "school_name": "G"},
            ]
        )
        assert r["education_level"] == "석사"
        assert r["education_deduction_years"] == 0


# ---------------------------------------------------------------------------
# safe_days
# ---------------------------------------------------------------------------


class TestSafeDays:
    @pytest.mark.parametrize(
        "value, expected",
        [
            (10, 10),
            (10.5, 10.5),
            (0, 0),
            (-5, 0),
            (None, 0),
            ("garbage", 0),
            ("10", 10),
            (float("nan"), 0),
            (float("inf"), 0),
            (float("-inf"), 0),
        ],
    )
    def test_safe_days(self, value, expected) -> None:  # noqa: ANN001
        assert safe_days(value) == expected


# ---------------------------------------------------------------------------
# norm_name
# ---------------------------------------------------------------------------


class TestNormName:
    @pytest.mark.parametrize(
        "raw, expected",
        [
            ("(주)한화건설", "한화건설"),
            ("㈜한화건설", "한화건설"),
            ("주식회사 한화건설", "한화건설"),
            ("한화 건설", "한화건설"),
            ("", ""),
            (None, ""),
        ],
    )
    def test_norm_name(self, raw, expected) -> None:  # noqa: ANN001
        assert norm_name(raw) == expected


# ---------------------------------------------------------------------------
# run_calculation — end-to-end parity with tiny synthetic input
# ---------------------------------------------------------------------------


class TestRunCalculation:
    def test_two_careers_one_company_no_overlap(self) -> None:
        """Two non-overlapping careers at the same company, 100% rate each.

        Careers: 2020-01-01 → 2020-12-31 (365 days), 2022-01-01 → 2022-12-31 (365).
        Company category: general_top100 → base_rate=100, regular employee.
        Expected recognized_days per career: 365 (= working_days * 100 / 100).
        """
        merge = {
            "applicant_name": "홍길동",
            "applied_field": "건축",
            "merged_careers": [
                {
                    "index": 0,
                    "company_name": "(주)테스트건설",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                    "working_days": 365,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
                {
                    "index": 1,
                    "company_name": "주식회사 테스트건설",
                    "period_start": "2022-01-01",
                    "period_end": "2022-12-31",
                    "working_days": 365,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
            ],
            "education": [{"degree": "학사"}],
        }

        r = run_calculation(merge, hiring_type="일반")

        details = r["career_details"]
        assert len(details) == 2
        assert details[0]["base_rate"] == 100
        assert details[0]["final_rate"] == 100
        assert details[0]["recognized_days"] == 365
        assert details[1]["recognized_days"] == 365
        # Normalization collapses "(주)테스트건설" and "주식회사 테스트건설" together.
        assert r["calculation_summary"]["total_working_days"] == 730
        assert r["calculation_summary"]["total_recognized_days"] == 730
        # 730 / 365 = 2.0
        assert r["calculation_summary"]["total_recognized_years"] == 2.0
        # 학사 차감 0 → final_career_years = 2.0
        assert r["calculation_summary"]["final_career_years"] == 2.0
        assert r["calculation_summary"]["education_deduction_years"] == 0
        assert r["calculation_summary"]["education_level"] == "학사"
        # Rate breakdown: rate_100 contains both careers, merged.
        assert "rate_100" in r["rate_breakdown"]
        assert r["rate_breakdown"]["rate_100"]["days"] == 730

    def test_career_under_90_days_excluded(self) -> None:
        merge = {
            "merged_careers": [
                {
                    "index": 0,
                    "company_name": "Shortstay",
                    "period_start": "2020-01-01",
                    "period_end": "2020-02-28",
                    "working_days": 59,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
            ],
            "education": [{"degree": "학사"}],
        }
        r = run_calculation(merge, hiring_type="일반")
        d = r["career_details"][0]
        assert d["recognized_days"] == 0
        assert d["final_rate"] == 0
        assert "3개월 미만 경력 제외" in d["rate_note"]

    def test_overlap_deducted_from_later_career(self) -> None:
        """First career 2020-01-01→2020-12-31, second 2020-06-01→2021-05-31.

        Sorted by period_start ascending: first added to covered list, second
        has overlap 2020-06-01 → 2020-12-31 (~214 days). Second is later.
        """
        merge = {
            "merged_careers": [
                {
                    "index": 0,
                    "company_name": "A건설",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                    "working_days": 366,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
                {
                    "index": 1,
                    "company_name": "A건설",
                    "period_start": "2020-06-01",
                    "period_end": "2021-05-31",
                    "working_days": 365,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
            ],
            "education": [{"degree": "박사"}],
        }

        r = run_calculation(merge, hiring_type="일반")
        details = sorted(r["career_details"], key=lambda d: d["index"])
        # Earlier career unaffected.
        assert details[0]["recognized_days"] == 366
        assert details[0].get("overlap_excluded") in (None, False)
        # Later career has overlap_days annotated.
        assert "overlap_days" in details[1]
        assert details[1]["overlap_days"] > 0
        assert details[1]["recognized_days"] < 365

    def test_overlap_ge_working_days_excluded(self) -> None:
        merge = {
            "merged_careers": [
                {
                    "index": 0,
                    "company_name": "B건설",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                    "working_days": 366,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
                {
                    "index": 1,
                    "company_name": "B건설",
                    "period_start": "2020-02-01",
                    "period_end": "2020-11-30",
                    "working_days": 304,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
            ],
        }
        r = run_calculation(merge, hiring_type="일반")
        later = next(d for d in r["career_details"] if d["index"] == 1)
        assert later["overlap_excluded"] is True
        assert later["recognized_days"] == 0
        assert later["final_rate"] == 0

    def test_in_progress_uses_now_ms_sentinel(self) -> None:
        """period_end=None → uses now_ms (injectable for determinism)."""
        # Treat "in-progress" as ending at 2023-12-31 for test determinism.
        injected_now = int(
            __import__("datetime")
            .datetime(2023, 12, 31, tzinfo=__import__("datetime").timezone.utc)
            .timestamp()
            * 1000
        )
        merge = {
            "merged_careers": [
                {
                    "index": 0,
                    "company_name": "StillWorking",
                    "period_start": "2023-01-01",
                    "period_end": None,
                    "working_days": 365,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
            ],
        }
        # Should not raise — the open-ended period is clamped to now_ms.
        r = run_calculation(merge, hiring_type="일반", now_ms=injected_now)
        assert r["career_details"][0]["recognized_days"] == 365

    def test_rate_breakdown_groups_by_final_rate(self) -> None:
        merge = {
            "merged_careers": [
                {
                    "index": 0,
                    "company_name": "TopCorp",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                    "working_days": 365,
                    "applied_company_category": "general_top100",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
                {
                    "index": 1,
                    "company_name": "SpecCorp",
                    "period_start": "2021-01-01",
                    "period_end": "2021-12-31",
                    "working_days": 365,
                    "applied_company_category": "specialty",
                    "employment_type": "regular",
                    "is_small_company": False,
                },
            ],
        }
        r = run_calculation(merge, hiring_type="일반")
        assert "rate_100" in r["rate_breakdown"]
        assert "rate_80" in r["rate_breakdown"]
        assert r["rate_breakdown"]["rate_100"]["days"] == 365
        assert r["rate_breakdown"]["rate_80"]["days"] == 292  # floor(365 * 80 / 100)


# ---------------------------------------------------------------------------
# Parity sanity check required by the task brief.
# ---------------------------------------------------------------------------


def test_rounding_parity_with_ts_math_round() -> None:
    """Sanity check: 0.8 * 100 → 80.0 after js_round_1."""
    assert js_round_1(0.8 * 100) == 80.0
    # Math.round(80.0 * 10) / 10 === 80.0
    assert js_round_1(80.0) == 80.0
    # Edge: 64.08 → Math.round(640.8)/10 = 641/10 = 64.1
    assert js_round_1(64.08) == 64.1
    assert math.isclose(js_round_1(64.04), 64.0)
