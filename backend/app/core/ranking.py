from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

import openpyxl

from app.core.normalize import norm_name

logger = logging.getLogger("career_evaluation.ranking")


@dataclass(frozen=True)
class RankingEntry:
    rank: int
    company: str


class RankingMatch(TypedDict):
    company_name: str
    year: int
    rank: int
    matched_name: str


class CompanyYears(TypedDict):
    name: str
    years: list[int]


# year -> list of entries (insertion order = rank order)
RANKING: dict[int, list[RankingEntry]] = {}

# year -> normalized_name -> entry  (O(1) exact-match lookup)
NORM_INDEX: dict[int, dict[str, RankingEntry]] = {}


def load(xlsx_path: Path) -> None:
    """Load ranking xlsx into module-level state. Called from FastAPI lifespan."""
    if not xlsx_path.exists():
        raise FileNotFoundError(f"ranking xlsx not found: {xlsx_path}")

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.worksheets[0]

    rows = ws.iter_rows(values_only=True)

    # Locate column indexes from header row
    header = next(rows, None)
    if header is None:
        wb.close()
        return

    col_year = col_rank = col_company = None
    for i, cell in enumerate(header):
        val = str(cell).strip() if cell is not None else ""
        if val == "연도":
            col_year = i
        elif val == "순위":
            col_rank = i
        elif val == "회사명":
            col_company = i

    if None in (col_year, col_rank, col_company):
        wb.close()
        raise ValueError(
            f"Required columns not found in header: 연도={col_year}, 순위={col_rank}, 회사명={col_company}"
        )

    RANKING.clear()
    NORM_INDEX.clear()

    for row in rows:
        try:
            year = int(row[col_year])  # type: ignore[index]
            rank = int(row[col_rank])  # type: ignore[index]
            company = str(row[col_company]).strip()  # type: ignore[index]
        except (TypeError, ValueError):
            continue

        entry = RankingEntry(rank=rank, company=company)

        if year not in RANKING:
            RANKING[year] = []
            NORM_INDEX[year] = {}

        RANKING[year].append(entry)
        normalized = norm_name(company)
        # Keep first occurrence on duplicate normalized names
        if normalized not in NORM_INDEX[year]:
            NORM_INDEX[year][normalized] = entry

    wb.close()
    logger.info("loaded %d year(s) of ranking data", len(RANKING))


def filter_rankings(companies: list[CompanyYears]) -> list[RankingMatch]:
    """Return ranking matches for the given companies and years."""
    results: list[RankingMatch] = []

    for company in companies:
        normalized = norm_name(company["name"])
        for year in company["years"]:
            year_index = NORM_INDEX.get(year)
            if year_index is None:
                continue
            entry = year_index.get(normalized)
            if entry is not None:
                results.append(
                    RankingMatch(
                        company_name=company["name"],
                        year=year,
                        rank=entry.rank,
                        matched_name=entry.company,
                    )
                )

    return results


def get_rankings_for_year(year: int) -> list[RankingEntry]:
    """Return a copy of ranking entries for the given year."""
    return list(RANKING.get(year, []))


def get_available_years() -> list[int]:
    """Return available years sorted descending."""
    return sorted(RANKING.keys(), reverse=True)
