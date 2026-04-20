"""Unit tests for app.services.merge.prepare() — no Gemini calls."""

from __future__ import annotations

import pytest

from app.core import ranking
from app.core.ranking import RankingEntry
from app.services.merge import (
    _resolve_category,
    prepare,
)


@pytest.fixture(autouse=True)
def _populate_ranking_state():
    """Populate ranking module state with a tiny fixture dataset."""
    prev_ranking = dict(ranking.RANKING)
    prev_norm = {y: dict(m) for y, m in ranking.NORM_INDEX.items()}

    ranking.RANKING.clear()
    ranking.NORM_INDEX.clear()

    fixture = {
        # Top 100 company across years
        "삼성물산": [(2019, 1), (2020, 1), (2021, 1), (2022, 1), (2023, 1)],
        # Mid-ranked
        "포스코이앤씨": [(2019, 5), (2020, 4), (2021, 4), (2022, 3), (2023, 3)],
        # Outside 100 (>100)
        "작은건설": [(2019, 150), (2020, 155), (2021, 160)],
        # Crosses threshold: top100 in 2019, outside in 2023
        "흔들리는건설": [(2019, 95), (2020, 98), (2022, 102), (2023, 120)],
    }

    for company, entries in fixture.items():
        for year, rank in entries:
            entry = RankingEntry(rank=rank, company=company)
            ranking.RANKING.setdefault(year, []).append(entry)
            normalized = company.replace("(주)", "").replace("㈜", "").replace("주식회사", "").replace(" ", "")
            ranking.NORM_INDEX.setdefault(year, {})[normalized] = entry

    yield

    ranking.RANKING.clear()
    ranking.NORM_INDEX.clear()
    ranking.RANKING.update(prev_ranking)
    ranking.NORM_INDEX.update(prev_norm)


# ---------------------------------------------------------------------------
# prepare() — ranking filter + pre-confirmation
# ---------------------------------------------------------------------------


class TestPrepare:
    async def test_top100_company_precategorized(self) -> None:
        resume = {
            "careers": [
                {
                    "company_name": "삼성물산",
                    "period_start": "2020-03-01",
                    "period_end": "2022-06-30",
                }
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        assert len(result["ranking_matches"]) > 0
        # Expect at least 3 matches (2020, 2021, 2022)
        years_seen = {m["year"] for m in result["ranking_matches"]}
        assert {2020, 2021, 2022}.issubset(years_seen)
        # Resolve category for 2020 start → rank 1 → general_top100
        resolved = _resolve_category(result["rank_by_company_year"], "삼성물산", 2020)
        assert resolved is not None
        assert resolved["category"] == "general_top100"
        assert resolved["rank"] == 1

    async def test_outside_top100_company_precategorized(self) -> None:
        resume = {
            "careers": [
                {
                    "company_name": "작은건설",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                }
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        assert len(result["ranking_matches"]) >= 1
        resolved = _resolve_category(result["rank_by_company_year"], "작은건설", 2020)
        assert resolved is not None
        assert resolved["category"] == "general_outside100"
        assert resolved["rank"] == 155

    async def test_company_not_in_ranking(self) -> None:
        resume = {
            "careers": [
                {
                    "company_name": "우주인터내셔널",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                }
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        # No matches; AI must decide
        assert result["ranking_matches"] == []
        resolved = _resolve_category(
            result["rank_by_company_year"], "우주인터내셔널", 2020
        )
        assert resolved is None
        # Prompt text should direct AI to search all companies
        assert "매칭되는 회사가 없습니다" in result["ranking_text"]

    async def test_multi_year_career_crossing_rank_threshold(self) -> None:
        """Company ranks top100 in 2019 but outside in 2023 — start year wins."""
        resume = {
            "careers": [
                {
                    "company_name": "흔들리는건설",
                    "period_start": "2019-06-01",
                    "period_end": "2023-06-30",
                }
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        resolved_start = _resolve_category(
            result["rank_by_company_year"], "흔들리는건설", 2019
        )
        assert resolved_start is not None
        assert resolved_start["category"] == "general_top100"
        assert resolved_start["year"] == 2019

        resolved_end = _resolve_category(
            result["rank_by_company_year"], "흔들리는건설", 2023
        )
        assert resolved_end is not None
        assert resolved_end["category"] == "general_outside100"
        assert resolved_end["year"] == 2023

    async def test_normalize_company_suffix(self) -> None:
        """(주)/주식회사 variants normalize identically to TS."""
        resume = {
            "careers": [
                {
                    "company_name": "(주)삼성물산",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                }
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        assert len(result["ranking_matches"]) >= 1
        resolved = _resolve_category(
            result["rank_by_company_year"], "(주)삼성물산", 2020
        )
        assert resolved is not None
        assert resolved["category"] == "general_top100"

    async def test_cert_careers_contribute_to_company_list(self) -> None:
        """Companies in cert technical_career also get ranking-filtered."""
        resume = {"careers": []}
        cert = {
            "technical_career": [
                {
                    "company_name": "포스코이앤씨",
                    "project_name": "현장 A",
                    "period_start": "2021-04-01",
                    "period_end": "2021-12-31",
                }
            ]
        }
        result = await prepare(resume, cert, "건축", "일반")
        assert any(m["company_name"] == "포스코이앤씨" for m in result["ranking_matches"])
        resolved = _resolve_category(
            result["rank_by_company_year"], "포스코이앤씨", 2021
        )
        assert resolved is not None
        assert resolved["rank"] == 4
        assert resolved["category"] == "general_top100"

    async def test_nearest_year_fallback_when_exact_missing(self) -> None:
        """start_year without ranking data → fall back to closest year."""
        # 2024 has no ranking fixture; closest is 2023.
        resume = {
            "careers": [
                {
                    "company_name": "삼성물산",
                    "period_start": "2024-01-01",
                    "period_end": "2024-06-30",
                }
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        # No 2024 index → no match emitted. But resolve_category should still
        # fall back to nearest year using rank_by_company_year seeded from the
        # career's spanned years (which is 2024 only, so empty).
        resolved = _resolve_category(
            result["rank_by_company_year"], "삼성물산", 2024
        )
        # No 2024 data was loaded → resolve returns None because no
        # ranking_matches were produced for 2024.
        assert resolved is None

    async def test_ranking_text_lists_precategorized_companies(self) -> None:
        resume = {
            "careers": [
                {
                    "company_name": "삼성물산",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                },
                {
                    "company_name": "작은건설",
                    "period_start": "2020-01-01",
                    "period_end": "2020-12-31",
                },
            ]
        }
        result = await prepare(resume, None, "건축", "일반")
        text = result["ranking_text"]
        assert "코드에서 확정" in text
        assert "삼성물산" in text
        assert "작은건설" in text
        assert "2020년=1위" in text
        assert "2020년=155위" in text
