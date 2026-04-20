"""Unit tests for ``app.services.employment`` — pattern enforcement & DSU.

These tests never call Gemini.  They hand-craft ``ai_output`` / ``analysis``
inputs for :func:`enforce_patterns` and directly assert the resulting
``merged_careers`` employment fields, plus the DSU-backed alias merging inside
:func:`analyze_career_patterns`.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.employment import (
    _UnionFind,
    analyze_career_patterns,
    enforce_patterns,
)


# ---------------------------------------------------------------------------
# Fixture helpers.
# ---------------------------------------------------------------------------


def _career(
    index: int,
    company: str,
    *,
    start: str = "2020-01-01",
    end: str = "2020-12-31",
    days: int = 365,
    source: str = "cert",
) -> dict[str, Any]:
    return {
        "index": index,
        "company_name": company,
        "project_name": f"project_{index}",
        "period_start": start,
        "period_end": end,
        "working_days": days,
        "position_raw": None,
        "source": source,
    }


def _ai_judgment(index: int, emp_type: str = "regular") -> dict[str, Any]:
    return {
        "index": index,
        "employment_type": emp_type,
        "employment_type_reason": "AI baseline",
    }


def _run_enforce(
    careers: list[dict[str, Any]],
    ai_judgments: list[dict[str, Any]],
    analysis: dict[str, Any],
    *,
    cert_wh: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    merge_result = {"merged_careers": careers}
    ai_output = {"judgments": ai_judgments, "new_flags": []}
    result = enforce_patterns(ai_output, analysis, merge_result, cert_wh)
    return result["merged_careers"]


# ---------------------------------------------------------------------------
# Pattern 1 — ≥3 distinct single-project companies ⇒ contract.
# ---------------------------------------------------------------------------


class TestPattern1SingleProjectCompanies:
    def test_three_singles_force_contract(self) -> None:
        careers = [
            _career(1, "A"),
            _career(2, "B"),
            _career(3, "C"),
        ]
        ai = [_ai_judgment(1), _ai_judgment(2), _ai_judgment(3)]
        analysis = {
            "single_project_companies": ["A", "B", "C"],
            "company_analyses": [
                {"company_name": "A", "career_count": 1},
                {"company_name": "B", "career_count": 1},
                {"company_name": "C", "career_count": 1},
            ],
        }
        out = _run_enforce(careers, ai, analysis)
        for c in out:
            assert c["employment_type"] == "contract"
            assert "현장 프로젝트직 패턴" in c["employment_type_reason"]
            assert "3개 회사" in c["employment_type_reason"]

    def test_two_singles_do_not_trigger(self) -> None:
        # Only 2 distinct singles — pattern 1 threshold is ≥ 3.
        careers = [_career(1, "A"), _career(2, "B")]
        ai = [_ai_judgment(1), _ai_judgment(2)]
        analysis = {
            "single_project_companies": ["A", "B"],
            "company_analyses": [
                {"company_name": "A", "career_count": 1},
                {"company_name": "B", "career_count": 1},
            ],
        }
        out = _run_enforce(careers, ai, analysis)
        for c in out:
            assert c["employment_type"] == "regular"
            assert c["employment_type_reason"] == "AI baseline"


# ---------------------------------------------------------------------------
# Pattern 2 — same company with ≥2 WH entries.
# ---------------------------------------------------------------------------


class TestPattern2WorkHistorySplit:
    def test_wh_split_forces_contract(self) -> None:
        # Two separate short WH windows, each with a single short project.
        careers = [
            _career(1, "X", start="2018-01-01", end="2018-12-31", days=365),
            _career(2, "X", start="2020-01-01", end="2020-06-30", days=181),
        ]
        ai = [_ai_judgment(1), _ai_judgment(2)]
        cert_wh = [
            {
                "company_name": "X",
                "period_start": "2018-01-01",
                "period_end": "2018-12-31",
            },
            {
                "company_name": "X",
                "period_start": "2020-01-01",
                "period_end": "2020-06-30",
            },
        ]
        analysis = {
            "single_project_companies": [],
            "company_analyses": [
                {
                    "company_name": "X",
                    "career_count": 2,
                    "cert_career_count": 2,
                    "cert_total_days": 546,
                    "total_days": 546,
                    "work_history_entries": 2,
                    "work_history_continuous": False,
                    "project_gaps": [],
                    "judgment": "비정규직 가능성 높음",
                }
            ],
        }
        out = _run_enforce(careers, ai, analysis, cert_wh=cert_wh)
        for c in out:
            assert c["employment_type"] == "contract"
            assert "work_history 2건" in c["employment_type_reason"]
            assert "고용 단절 패턴" in c["employment_type_reason"]

    def test_wh_split_exception_regular_maintained(self) -> None:
        # One of the WH windows has 2 projects summing > 730 days →
        # pattern 2 keeps those careers as regular (it overrides AI contract).
        careers = [
            # WH #1: long-term regular (3 projects, 1100 days total)
            _career(1, "Y", start="2015-01-01", end="2016-06-30", days=547),
            _career(2, "Y", start="2016-07-01", end="2017-12-31", days=549),
            # WH #2: brief return, single project
            _career(3, "Y", start="2020-01-01", end="2020-03-31", days=91),
        ]
        # AI mis-classifies #1 and #2 as contract; we expect pattern 2 to
        # flip them back to regular because WH #1 has ≥2 projects & > 730d.
        ai = [
            _ai_judgment(1, "contract"),
            _ai_judgment(2, "contract"),
            _ai_judgment(3),
        ]
        cert_wh = [
            {
                "company_name": "Y",
                "period_start": "2015-01-01",
                "period_end": "2017-12-31",
            },
            {
                "company_name": "Y",
                "period_start": "2020-01-01",
                "period_end": "2020-03-31",
            },
        ]
        analysis = {
            "single_project_companies": [],
            "company_analyses": [
                {
                    "company_name": "Y",
                    "career_count": 3,
                    "cert_career_count": 3,
                    "cert_total_days": 1187,
                    "total_days": 1187,
                    "work_history_entries": 2,
                    "work_history_continuous": False,
                    "project_gaps": [],
                    "judgment": "비정규직 가능성 높음",
                }
            ],
        }
        out = _run_enforce(careers, ai, analysis, cert_wh=cert_wh)
        # Careers 1 & 2 (inside long WH) → regular via the "2년 초과" exception.
        assert out[0]["employment_type"] == "regular"
        assert "2년 초과" in out[0]["employment_type_reason"]
        assert out[1]["employment_type"] == "regular"
        # Career 3 (lone short WH) → forced contract.
        assert out[2]["employment_type"] == "contract"


# ---------------------------------------------------------------------------
# Pattern 3 — contract_ratio ≥ 40% + cert_count ≥ 2 + cert_days ≤ 730.
# ---------------------------------------------------------------------------


class TestPattern3ContractRatio:
    def test_high_contract_ratio_forces_short_multi_project_company(self) -> None:
        # 3 careers — AI marks 2 as contract → ratio 2/3 = 67% ≥ 40%.
        # Company Z has 2 cert projects summing to 500 days → within the
        # (cert_count ≥ 2, cert_days ≤ 730) window → pattern 3 fires.
        careers = [
            _career(1, "Other1", start="2015-01-01", end="2015-12-31", days=365),
            _career(2, "Z", start="2018-01-01", end="2018-06-30", days=181),
            _career(3, "Z", start="2018-07-01", end="2019-03-31", days=273),
        ]
        ai = [
            _ai_judgment(1, "contract"),
            _ai_judgment(2, "contract"),
            _ai_judgment(3),  # regular initially
        ]
        analysis = {
            "single_project_companies": ["Other1"],  # < 3 so pattern 1 skips
            "company_analyses": [
                {
                    "company_name": "Z",
                    "career_count": 2,
                    "cert_career_count": 2,
                    "cert_total_days": 454,
                    "total_days": 454,
                    "work_history_entries": 1,
                    "work_history_continuous": True,
                    "project_gaps": [],
                    "judgment": "",
                },
            ],
        }
        out = _run_enforce(careers, ai, analysis)
        # Career 3 (previously regular) must now be contract via pattern 3.
        assert out[2]["employment_type"] == "contract"
        assert "2년 이내" in out[2]["employment_type_reason"]
        assert "전체 비정규직 비율" in out[2]["employment_type_reason"]

    def test_low_contract_ratio_skips_pattern(self) -> None:
        # Only 1/3 careers contract → ratio 33% < 40% → pattern 3 skipped.
        careers = [
            _career(1, "A", start="2015-01-01", end="2015-12-31"),
            _career(2, "Z", start="2018-01-01", end="2018-06-30", days=181),
            _career(3, "Z", start="2018-07-01", end="2019-03-31", days=273),
        ]
        ai = [_ai_judgment(1, "contract"), _ai_judgment(2), _ai_judgment(3)]
        analysis = {
            "single_project_companies": ["A"],
            "company_analyses": [
                {
                    "company_name": "Z",
                    "career_count": 2,
                    "cert_career_count": 2,
                    "cert_total_days": 454,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
            ],
        }
        out = _run_enforce(careers, ai, analysis)
        # Both Z careers stay regular because the ratio gate fails.
        assert out[1]["employment_type"] == "regular"
        assert out[2]["employment_type"] == "regular"


# ---------------------------------------------------------------------------
# Pattern 4 — resume_only career in a cert-covered company.
# ---------------------------------------------------------------------------


class TestPattern4ResumeOnly:
    def test_resume_only_forced_when_ratio_high(self) -> None:
        # Isolate pattern 4: keep single_project_companies below 3 so pattern
        # 1 cannot fire, and keep company W out of pattern 3's window.
        # Ratio 3/5 = 60% ≥ 40% via AI contract labels on Solo1/Solo2/Solo3.
        careers = [
            _career(1, "Solo1", source="cert"),
            _career(2, "Solo2", source="cert"),
            _career(3, "Solo3", source="cert"),
            # W: cert career + resume_only peer.  cert_total_days > 730
            # and cert_career_count == 1 so pattern 3 skips.
            _career(4, "W", start="2019-01-01", end="2021-12-31", days=1095, source="cert"),
            _career(5, "W", start="2022-01-01", end="2022-06-30", days=181, source="resume_only"),
        ]
        ai = [
            _ai_judgment(1, "contract"),
            _ai_judgment(2, "contract"),
            _ai_judgment(3, "contract"),
            _ai_judgment(4),  # regular
            _ai_judgment(5),  # regular — pattern 4 should flip this.
        ]
        analysis = {
            # Only 3 solos → pattern 1 requires ≥ 3; but we want pattern 1 OFF
            # for company W specifically.  W is NOT in single_project_companies
            # because it has 2 careers, so pattern 1 only touches Solo1/2/3
            # which are already contract — safe.
            "single_project_companies": ["Solo1", "Solo2", "Solo3"],
            "company_analyses": [
                {
                    "company_name": "W",
                    "career_count": 2,
                    "cert_career_count": 1,  # only one cert — pattern 3 needs ≥ 2
                    "cert_total_days": 1095,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
                {
                    "company_name": "Solo1",
                    "career_count": 1,
                    "cert_career_count": 1,
                    "cert_total_days": 365,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
                {
                    "company_name": "Solo2",
                    "career_count": 1,
                    "cert_career_count": 1,
                    "cert_total_days": 365,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
                {
                    "company_name": "Solo3",
                    "career_count": 1,
                    "cert_career_count": 1,
                    "cert_total_days": 365,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
            ],
        }
        out = _run_enforce(careers, ai, analysis)
        # #5 (resume_only, company W) must be flipped to contract by pattern 4.
        assert out[4]["employment_type"] == "contract"
        assert "이력서만 있는 경력" in out[4]["employment_type_reason"]
        assert "전체 비정규직 비율" in out[4]["employment_type_reason"]
        # #4 (cert career in W) is left untouched — pattern 3 skipped because
        # cert_career_count < 2.
        assert out[3]["employment_type"] == "regular"

    def test_resume_only_skipped_when_no_cert_peer(self) -> None:
        # Company V only has the resume_only career — no cert peer →
        # pattern 4 skips even with high contract ratio.
        careers = [
            _career(1, "Solo1", source="cert"),
            _career(2, "Solo2", source="cert"),
            _career(3, "V", source="resume_only"),
        ]
        ai = [_ai_judgment(1, "contract"), _ai_judgment(2, "contract"), _ai_judgment(3)]
        analysis = {
            "single_project_companies": ["Solo1", "Solo2", "V"],  # 3 so pattern 1 fires
            "company_analyses": [
                {
                    "company_name": "V",
                    "career_count": 1,
                    "cert_career_count": 0,  # ← no cert peer
                    "cert_total_days": 0,
                    "work_history_entries": 0,
                    "project_gaps": [],
                    "judgment": "",
                },
                {
                    "company_name": "Solo1",
                    "career_count": 1,
                    "cert_career_count": 1,
                    "cert_total_days": 365,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
                {
                    "company_name": "Solo2",
                    "career_count": 1,
                    "cert_career_count": 1,
                    "cert_total_days": 365,
                    "work_history_entries": 1,
                    "project_gaps": [],
                    "judgment": "",
                },
            ],
        }
        out = _run_enforce(careers, ai, analysis)
        # Pattern 1 flips V (single-project set ≥ 3) — reason is pattern 1,
        # not pattern 4.  Verify we see the pattern 1 reason string.
        assert out[2]["employment_type"] == "contract"
        assert "현장 프로젝트직 패턴" in out[2]["employment_type_reason"]


# ---------------------------------------------------------------------------
# DSU / alias resolution — order independence.
# ---------------------------------------------------------------------------


class TestUnionFind:
    def test_chain_merge_is_order_independent(self) -> None:
        # a ↔ b, b ↔ c — everything should collapse to a single root.
        uf1 = _UnionFind()
        uf1.union("a", "b")
        uf1.union("b", "c")

        uf2 = _UnionFind()
        uf2.union("b", "c")
        uf2.union("a", "b")

        assert uf1.find("a") == uf1.find("c")
        assert uf2.find("a") == uf2.find("c")
        assert uf1.find("a") == uf2.find("a")


class TestAliasResolution:
    def test_alias_via_company_name_current_merges_groups(self) -> None:
        # WH entries: "OldCorp" renamed to "NewCorp"; cert career uses "NewCorp".
        # They must collapse into ONE company_analysis row.
        careers = [
            _career(1, "NewCorp", start="2021-01-01", end="2021-12-31"),
            _career(2, "NewCorp", start="2022-01-01", end="2022-12-31"),
        ]
        work_history = [
            {
                "company_name": "OldCorp",
                "company_name_current": "NewCorp",
                "period_start": "2021-01-01",
                "period_end": "2022-12-31",
            },
        ]
        analysis = analyze_career_patterns(careers, work_history)
        assert len(analysis["company_analyses"]) == 1
        ca = analysis["company_analyses"][0]
        # 1 consecutive WH window → regular signal.
        assert ca["work_history_entries"] == 1
        assert ca["work_history_continuous"] is True

    def test_alias_order_independence(self) -> None:
        # Emit WH in the reverse pairing order — the DSU should still merge
        # "OldCorp" and "NewCorp" into one group.
        careers = [_career(1, "OldCorp"), _career(2, "NewCorp")]
        # NOTE: TS's Map-based approach is order-sensitive for the primary-key
        # choice, but the *grouping* (which names end up in the same bucket)
        # is order-independent.  Our DSU matches that.
        wh_forward = [
            {
                "company_name": "OldCorp",
                "company_name_current": "NewCorp",
                "period_start": "2020-01-01",
                "period_end": "2020-12-31",
            },
            {
                "company_name": "NewCorp",
                "company_name_current": None,
                "period_start": "2021-01-01",
                "period_end": "2021-12-31",
            },
        ]
        wh_reverse = list(reversed(wh_forward))

        forward = analyze_career_patterns(careers, wh_forward)
        reverse = analyze_career_patterns(careers, wh_reverse)

        # Same number of companies in both orderings.
        assert len(forward["company_analyses"]) == len(reverse["company_analyses"])
        # Careers share a single bucket — cert_total_days reflects BOTH careers.
        total_days_forward = {
            a["company_name"]: a["total_days"] for a in forward["company_analyses"]
        }
        total_days_reverse = {
            a["company_name"]: a["total_days"] for a in reverse["company_analyses"]
        }
        assert total_days_forward == total_days_reverse
        # Both orderings report the same work_history_entries count per bucket.
        wh_forward_counts = sorted(
            a["work_history_entries"] for a in forward["company_analyses"]
        )
        wh_reverse_counts = sorted(
            a["work_history_entries"] for a in reverse["company_analyses"]
        )
        assert wh_forward_counts == wh_reverse_counts


# ---------------------------------------------------------------------------
# Missing-judgment fallback.
# ---------------------------------------------------------------------------


def test_missing_ai_judgment_defaults_to_unknown() -> None:
    careers = [_career(1, "A"), _career(2, "B")]
    # Only judgment for #1 is supplied.
    ai = [_ai_judgment(1)]
    analysis = {
        "single_project_companies": ["A", "B"],
        "company_analyses": [
            {"company_name": "A", "career_count": 1},
            {"company_name": "B", "career_count": 1},
        ],
    }
    out = _run_enforce(careers, ai, analysis)
    assert out[0]["employment_type"] == "regular"
    assert out[1]["employment_type"] == "unknown"
    assert out[1]["employment_type_reason"] == "AI 판정 누락"
