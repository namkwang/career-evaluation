from __future__ import annotations

"""
career_details[] + work_history[] → EmploymentPeriod[] conversion utility.

Ports src/lib/employment-periods.ts faithfully.
"""

import logging
from dataclasses import dataclass, field
from typing import Literal

from app.core.normalize import norm_name

logger = logging.getLogger("career_evaluation.employment_periods")


# ---------------------------------------------------------------------------
# Data types (mirror TS interfaces)
# ---------------------------------------------------------------------------

@dataclass
class WorkHistoryEntry:
    period_start: str
    period_end: str | None
    company_name: str
    company_name_current: str | None = None


@dataclass
class CareerDetail:
    index: int
    company_name: str
    project_name: str | None
    period_start: str
    period_end: str
    working_days: int
    source: str
    company_category: str
    applied_company_category: str | None = None
    is_small_company: bool | None = None
    ranking_year: int | None = None
    ranking_position: int | None = None
    company_category_reason: str | None = None
    employment_type: str = ""
    employment_type_reason: str | None = None
    base_rate: float = 0.0
    contract_adjustment: bool = False
    final_rate: float = 0.0
    rate_note: str = ""
    recognized_days: int = 0
    continuous_group_id: str | None = None
    military_engineer: bool | None = None
    overlap_excluded: bool = False
    overlap_days: int | None = None


@dataclass
class MergedChild:
    project_name: str | None
    period_start: str
    period_end: str
    working_days: int


@dataclass
class EPProject:
    index: int
    project_name: str | None
    period_start: str
    period_end: str
    working_days: int
    recognized_days: int
    source: str
    rate_note: str | None = None
    overlap_excluded: bool | None = None
    overlap_days: int | None = None
    merged_children: list[MergedChild] | None = None


@dataclass
class EmploymentPeriod:
    ep_id: str
    company_name: str
    period_start: str
    period_end: str | None
    source: Literal["certificate", "resume_only"]

    company_category: str
    is_small_company: bool | None
    ranking_year: int | None
    ranking_position: int | None
    company_category_reason: str | None
    employment_type: str
    employment_type_reason: str | None
    military_engineer: bool | None

    base_rate: float
    contract_adjustment: bool
    final_rate: float

    total_working_days: int
    total_recognized_days: int

    projects: list[EPProject] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date_overlaps(
    a_start: str,
    a_end: str | None,
    b_start: str,
    b_end: str,
) -> bool:
    """Return True when the two date ranges overlap (inclusive)."""
    # ISO 8601 strings compare correctly lexicographically
    ae = a_end if a_end is not None else "9999-12-31"
    return a_start <= b_end and ae >= b_start


# ---------------------------------------------------------------------------
# Merge overlap projects
# ---------------------------------------------------------------------------

def _merge_overlap_projects(projects: list[CareerDetail]) -> list[EPProject]:
    """
    Port of TS mergeOverlapProjects.

    overlap_excluded projects are absorbed into their best-overlap parent.
    Returns visible EPProject list sorted newest-first.
    """
    non_excluded: list[CareerDetail] = [p for p in projects if not p.overlap_excluded]
    excluded: list[CareerDetail] = [p for p in projects if p.overlap_excluded]

    # Map: parent index -> list of absorbed children
    children_map: dict[int, list[MergedChild]] = {}

    for ex in excluded:
        ex_start = ex.period_start
        ex_end = ex.period_end

        best_idx = -1
        best_overlap_days = 0

        for ne in non_excluded:
            # Calculate overlap length (using string comparison is not enough
            # for arithmetic; we need to compare ordinally for max-overlap)
            os_str = max(ex_start, ne.period_start)
            oe_str = min(ex_end, ne.period_end)
            if os_str <= oe_str:
                # Approximate overlap as string diff is insufficient — convert
                # to ordinal day count via a simple YYYY-MM-DD subtraction.
                overlap_days = _approx_days_between(os_str, oe_str)
                if overlap_days > best_overlap_days:
                    best_overlap_days = overlap_days
                    best_idx = ne.index

        if best_idx >= 0:
            if best_idx not in children_map:
                children_map[best_idx] = []
            children_map[best_idx].append(
                MergedChild(
                    project_name=ex.project_name,
                    period_start=ex.period_start,
                    period_end=ex.period_end,
                    working_days=ex.working_days,
                )
            )
        else:
            # No parent found — show as standalone (0 recognized days retained)
            non_excluded.append(ex)

    # Sort newest-first (ISO strings compare lexicographically)
    sorted_projects = sorted(non_excluded, key=lambda p: p.period_start, reverse=True)

    visible: list[EPProject] = [
        EPProject(
            index=p.index,
            project_name=p.project_name,
            period_start=p.period_start,
            period_end=p.period_end,
            working_days=p.working_days,
            recognized_days=p.recognized_days,
            source=p.source,
            rate_note=p.rate_note or None,
            overlap_excluded=p.overlap_excluded if p.overlap_excluded else None,
            overlap_days=p.overlap_days,
            merged_children=children_map.get(p.index),
        )
        for p in sorted_projects
    ]

    return visible


def _approx_days_between(start_iso: str, end_iso: str) -> int:
    """
    Approximate day count between two YYYY-MM-DD (or YYYY-MM) strings.
    Good enough for determining the best-overlap parent.
    """
    def _to_days(s: str) -> int:
        parts = s.split("-")
        y = int(parts[0]) if len(parts) > 0 else 0
        m = int(parts[1]) if len(parts) > 1 else 1
        d = int(parts[2]) if len(parts) > 2 else 1
        return y * 365 + m * 30 + d

    return max(0, _to_days(end_iso) - _to_days(start_iso))


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_employment_periods(
    career_details: list[CareerDetail],
    work_history: list[WorkHistoryEntry] | None,
) -> list[EmploymentPeriod]:
    """
    Port of TS buildEmploymentPeriods.

    Converts flat career_details + work_history into a 2-level
    EmploymentPeriod > EPProject hierarchy.
    """
    if not career_details:
        return []

    sorted_wh: list[WorkHistoryEntry] | None = None
    if work_history:
        sorted_wh = sorted(work_history, key=lambda w: w.period_start or "")

    matched: set[int] = set()
    periods: list[EmploymentPeriod] = []

    if sorted_wh:
        for wh in sorted_wh:
            wh_keys = [norm_name(wh.company_name)]
            if wh.company_name_current:
                wh_keys.append(norm_name(wh.company_name_current))

            matched_projects: list[CareerDetail] = []
            for cd in career_details:
                if cd.index in matched:
                    continue
                if norm_name(cd.company_name) not in wh_keys:
                    continue
                if not _date_overlaps(
                    wh.period_start,
                    wh.period_end,
                    cd.period_start,
                    cd.period_end,
                ):
                    continue
                matched_projects.append(cd)
                matched.add(cd.index)

            if not matched_projects:
                continue

            # Sort newest-first within the period
            matched_projects.sort(key=lambda p: p.period_start, reverse=True)

            visible_projects = _merge_overlap_projects(matched_projects)

            # Representative: first non-excluded project, else first overall
            rep = next(
                (p for p in matched_projects if not p.overlap_excluded),
                matched_projects[0],
            )

            ep_id = f"ep_{norm_name(wh.company_name)}_{wh.period_start}"
            periods.append(
                EmploymentPeriod(
                    ep_id=ep_id,
                    company_name=rep.company_name,
                    period_start=wh.period_start,
                    period_end=wh.period_end,
                    source="certificate",
                    company_category=rep.applied_company_category or rep.company_category,
                    is_small_company=rep.is_small_company,
                    ranking_year=rep.ranking_year,
                    ranking_position=rep.ranking_position,
                    company_category_reason=rep.company_category_reason,
                    employment_type=rep.employment_type,
                    employment_type_reason=rep.employment_type_reason,
                    military_engineer=rep.military_engineer,
                    base_rate=rep.base_rate,
                    contract_adjustment=rep.contract_adjustment,
                    final_rate=rep.final_rate,
                    total_working_days=sum(p.working_days for p in matched_projects),
                    total_recognized_days=sum(p.recognized_days for p in matched_projects),
                    projects=visible_projects,
                )
            )

    # Unmatched career_details (resume-only or no work_history provided)
    unmatched = [cd for cd in career_details if cd.index not in matched]
    if unmatched:
        # Group by normalized company name (insertion order preserved, Python 3.7+)
        by_company: dict[str, list[CareerDetail]] = {}
        for cd in unmatched:
            key = norm_name(cd.company_name)
            if key not in by_company:
                by_company[key] = []
            by_company[key].append(cd)

        for group in by_company.values():
            group.sort(key=lambda p: p.period_start, reverse=True)

            visible_projects = _merge_overlap_projects(group)

            rep = next(
                (p for p in group if not p.overlap_excluded),
                group[0],
            )

            starts = sorted(g.period_start for g in group)
            ends = sorted(g.period_end for g in group)

            ep_id = f"ep_{norm_name(rep.company_name)}_{starts[0]}"
            periods.append(
                EmploymentPeriod(
                    ep_id=ep_id,
                    company_name=rep.company_name,
                    period_start=starts[0],
                    period_end=ends[-1],
                    source="resume_only",
                    company_category=rep.applied_company_category or rep.company_category,
                    is_small_company=rep.is_small_company,
                    ranking_year=rep.ranking_year,
                    ranking_position=rep.ranking_position,
                    company_category_reason=rep.company_category_reason,
                    employment_type=rep.employment_type,
                    employment_type_reason=rep.employment_type_reason,
                    military_engineer=rep.military_engineer,
                    base_rate=rep.base_rate,
                    contract_adjustment=rep.contract_adjustment,
                    final_rate=rep.final_rate,
                    total_working_days=sum(p.working_days for p in group),
                    total_recognized_days=sum(p.recognized_days for p in group),
                    projects=visible_projects,
                )
            )

    # Sort all periods newest-first by period_start
    periods.sort(key=lambda ep: ep.period_start, reverse=True)

    return periods
