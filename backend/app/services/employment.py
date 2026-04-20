"""Employment-type judgment service for /api/employment.

Byte-level parity port of ``src/app/api/employment/route.ts``. The module
combines one Gemini call with 4 code-enforced heuristic patterns.  Only the
heuristic logic is parity-critical; the AI call is a thin passthrough.

Naming notes (TS → Python):

* ``analyzeCareerPatterns`` → :func:`analyze_career_patterns`
* ``nameAliases`` Map → :class:`_UnionFind` (order-independent merge)
* pattern block 1..4 in the TS ``POST`` handler → :func:`enforce_patterns`

The reason strings attached to each career are shown in the frontend verbatim,
so they are ported byte-for-byte from TS.
"""

from __future__ import annotations

import copy
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.core.gemini import call_gemini, parse_json_response
from app.core.normalize import norm_name, parse_iso

logger = logging.getLogger("career_evaluation.employment")

# One calendar day in milliseconds — matches TS ``DAY = 86400000``.
_DAY_MS = 86400000


# ---------------------------------------------------------------------------
# Union-Find for work_history alias resolution (sana-name merges).
# ---------------------------------------------------------------------------


class _UnionFind:
    """Tiny DSU keyed by strings — order-independent alias merges.

    TS reads ``company_name`` / ``company_name_current`` pairs in sequence and
    threads a ``nameAliases`` Map, which means the resolved primary key can
    depend on the iteration order (first-seen wins).  Porting to DSU makes the
    merge independent of input order, which is what the TS logic conceptually
    wants (``company_name`` and ``company_name_current`` refer to the same
    real company, regardless of how many rename hops appear in the cert).

    # FIXME parity: TS chooses the existing primary for the first of the two
    # keys; we choose the lexicographically-smaller root so that merges are
    # associative.  The resulting groupings match TS whenever each alias pair
    # is disjoint, which is the real-world shape.
    """

    def __init__(self) -> None:
        self._parent: dict[str, str] = {}

    def add(self, key: str) -> None:
        if key not in self._parent:
            self._parent[key] = key

    def find(self, key: str) -> str:
        self.add(key)
        # Path compression.
        root = key
        while self._parent[root] != root:
            root = self._parent[root]
        cur = key
        while self._parent[cur] != root:
            self._parent[cur], cur = root, self._parent[cur]
        return root

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        # Deterministic root: lexicographically-smaller wins.
        if ra < rb:
            self._parent[rb] = ra
        else:
            self._parent[ra] = rb


# ---------------------------------------------------------------------------
# Pre-AI analysis.
# ---------------------------------------------------------------------------


@dataclass
class CompanyAnalysis:
    company_name: str
    career_count: int
    cert_career_count: int
    cert_total_days: int
    total_days: int
    work_history_entries: int
    work_history_continuous: bool
    project_gaps: list[dict[str, Any]] = field(default_factory=list)
    judgment: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "company_name": self.company_name,
            "career_count": self.career_count,
            "cert_career_count": self.cert_career_count,
            "cert_total_days": self.cert_total_days,
            "total_days": self.total_days,
            "work_history_entries": self.work_history_entries,
            "work_history_continuous": self.work_history_continuous,
            "project_gaps": list(self.project_gaps),
            "judgment": self.judgment,
        }


def _to_ms(date_str: str | None) -> int | None:
    """Parse an ISO date to epoch-ms (UTC).  Matches ``new Date(str).getTime()``."""
    dt = parse_iso(date_str)
    if dt is None:
        return None
    if dt.tzinfo is None:
        # parse_iso preserves naive datetimes; TS ``new Date('YYYY-MM-DD')``
        # treats the string as UTC midnight.  Align to that.
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def analyze_career_patterns(
    careers: list[dict[str, Any]],
    work_history: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Port of TS ``analyzeCareerPatterns``.

    Groups careers and work_history by normalized company name.  When a
    ``work_history`` entry carries a ``company_name_current`` alias, that
    name is unioned with the original name so both forms resolve to a single
    company group (DSU, order-independent).
    """
    # Group careers.
    by_company: dict[str, list[dict[str, Any]]] = {}
    for c in careers:
        key = norm_name(c.get("company_name"))
        by_company.setdefault(key, []).append(c)

    # Build alias DSU + group work_history.
    wh_by_company: dict[str, list[dict[str, Any]]] = {}
    dsu = _UnionFind()
    if work_history is not None:
        for wh in work_history:
            key = norm_name(wh.get("company_name"))
            dsu.add(key)
            cur = wh.get("company_name_current")
            if cur:
                alt = norm_name(cur)
                dsu.add(alt)
                dsu.union(key, alt)
        for wh in work_history:
            key = norm_name(wh.get("company_name"))
            primary = dsu.find(key)
            wh_by_company.setdefault(primary, []).append(wh)

    company_analyses: list[CompanyAnalysis] = []
    for key, company_careers in by_company.items():
        sorted_careers = sorted(
            company_careers,
            key=lambda c: c.get("period_start") or "",
        )

        # Project gaps — TS: round((nextStart - end) / 86400000) - 1.
        project_gaps: list[dict[str, Any]] = []
        for i in range(len(sorted_careers) - 1):
            end_ms = _to_ms(sorted_careers[i].get("period_end"))
            nxt_ms = _to_ms(sorted_careers[i + 1].get("period_start"))
            if end_ms is None or nxt_ms is None:
                continue
            # JS ``Math.round`` rounds half toward +infinity; the subtraction
            # here is always a whole-day multiple when dates are YYYY-MM-DD,
            # so plain round() suffices.
            gap_days = round((nxt_ms - end_ms) / _DAY_MS) - 1
            if gap_days > 0:
                project_gaps.append(
                    {
                        "between": (
                            f"#{sorted_careers[i].get('index')}"
                            f"(~{sorted_careers[i].get('period_end')}) → "
                            f"#{sorted_careers[i + 1].get('index')}"
                            f"({sorted_careers[i + 1].get('period_start')}~)"
                        ),
                        "gap_days": gap_days,
                    }
                )

        primary_key = dsu.find(key) if work_history is not None else key
        wh_entries = wh_by_company.get(primary_key) or wh_by_company.get(key) or []
        wh_count = len(wh_entries)
        wh_continuous = wh_count == 1

        # Judgment string — keep byte-for-byte equal to TS.
        if work_history is None:
            judgment = "경력증명서 미제출 — work_history 대조 불가"
        elif wh_count == 0:
            judgment = "경력증명서에 해당 회사 근무 이력 없음 (이력서만 있는 경력)"
        elif wh_continuous and len(project_gaps) == 0:
            judgment = (
                "정규직 가능성 높음: work_history 1건 연속 + 프로젝트 간 단절 없음"
            )
        elif wh_continuous and len(project_gaps) > 0:
            judgment = (
                "정규직 가능성 높음: work_history 1건 연속 "
                "(프로젝트 간 공백은 본사 대기로 추정)"
            )
        elif wh_count >= 2:
            judgment = (
                f"비정규직 가능성 높음: work_history가 {wh_count}건으로 끊어져 반복 등장 "
                "→ 고용이 끊어졌다 재개된 패턴"
            )
        else:
            judgment = "판단 불가"

        cert_only = [c for c in sorted_careers if c.get("source") != "resume_only"]
        company_analyses.append(
            CompanyAnalysis(
                company_name=sorted_careers[0].get("company_name", ""),
                career_count=len(sorted_careers),
                cert_career_count=len(cert_only),
                cert_total_days=sum(int(c.get("working_days") or 0) for c in cert_only),
                total_days=sum(int(c.get("working_days") or 0) for c in sorted_careers),
                work_history_entries=wh_count,
                work_history_continuous=wh_continuous,
                project_gaps=project_gaps,
                judgment=judgment,
            )
        )

    single_project_companies = [
        a.company_name for a in company_analyses if a.career_count == 1
    ]

    return {
        "company_analyses": [a.to_dict() for a in company_analyses],
        "single_project_companies": single_project_companies,
    }


# ---------------------------------------------------------------------------
# AI call.
# ---------------------------------------------------------------------------


def _format_analysis_text(analysis: dict[str, Any]) -> str:
    """Mirror the TS ``analysisText`` template literal byte-for-byte."""
    analyses: list[dict[str, Any]] = analysis.get("company_analyses", [])
    single_companies: list[str] = analysis.get("single_project_companies", [])

    lines: list[str] = []
    for a in analyses:
        gaps = a.get("project_gaps", [])
        gap_suffix = f", 프로젝트 간 공백 {len(gaps)}회" if len(gaps) > 0 else ""
        lines.append(
            f"- {a.get('company_name')}: 경력 {a.get('career_count')}건, "
            f"work_history {a.get('work_history_entries')}건{gap_suffix}\n"
            f"  → {a.get('judgment')}"
        )

    wh2plus = [a for a in analyses if a.get("work_history_entries", 0) >= 2]
    wh2plus_block = ""
    if wh2plus:
        rows = "\n".join(
            f"- {a.get('company_name')}: work_history {a.get('work_history_entries')}건 "
            f"→ 고용이 {a.get('work_history_entries')}회 끊어짐"
            for a in wh2plus
        )
        wh2plus_block = (
            "\n⚠ work_history가 끊어져 반복 등장하는 회사 (비정규직 가능성 높음):\n"
            f"{rows}\n"
        )

    single_block = ""
    if len(single_companies) >= 2:
        single_block = (
            f"\n⚠ 서로 다른 회사에서 각각 1건만 수행 "
            f"({len(single_companies)}개사):\n"
            f"{', '.join(single_companies)}\n"
        )

    return (
        "\n[코드 사전 분석 결과 — 반드시 참고하세요]\n\n"
        "회사별 분석 (경력증명서 work_history 기준):\n"
        + "\n".join(lines)
        + "\n"
        + wh2plus_block
        + single_block
    )


async def call_ai(
    merge_result: dict[str, Any],
    analysis: dict[str, Any],
    prompts: tuple[str, str],
) -> dict[str, Any]:
    """Run the Gemini call.  The TS handler uses ``callGemini`` (no web search)."""
    system_prompt, user_prompt = prompts
    analysis_text = _format_analysis_text(analysis)
    filled_user_prompt = (
        user_prompt.replace(
            "{Step 2 출력 JSON}", json.dumps(merge_result, ensure_ascii=False, indent=2)
        )
        + "\n"
        + analysis_text
    )

    text = await call_gemini(system_prompt, filled_user_prompt)
    parsed = parse_json_response(text)
    if not isinstance(parsed, dict):
        raise ValueError("AI returned non-object for employment judgments")
    return parsed


# ---------------------------------------------------------------------------
# Code-enforced patterns.
# ---------------------------------------------------------------------------


def _set_employment(
    career: dict[str, Any],
    emp_type: str,
    reason: str,
) -> None:
    career["employment_type"] = emp_type
    career["employment_type_reason"] = reason


def enforce_patterns(
    ai_output: dict[str, Any],
    analysis: dict[str, Any],
    merge_result: dict[str, Any],
    cert_work_history: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """Apply the 4 code-enforced patterns on top of AI judgments.

    Returns a new ``employment_result`` dict (deep-copied from ``merge_result``)
    with ``employment_type`` / ``employment_type_reason`` set on every career.
    Patterns 1..4 run in the same order as TS; the last pattern to fire on a
    given career wins.
    """
    employment_result = copy.deepcopy(merge_result)

    # 1) Merge AI judgments into the deep-copied merge_result.
    judgment_map: dict[int, dict[str, str]] = {}
    for j in ai_output.get("judgments") or []:
        try:
            idx = int(j.get("index"))
        except (TypeError, ValueError):
            continue
        judgment_map[idx] = {
            "employment_type": j.get("employment_type", "unknown"),
            "employment_type_reason": j.get("employment_type_reason", ""),
        }

    result_careers: list[dict[str, Any]] = employment_result.get("merged_careers") or []
    for c in result_careers:
        try:
            idx = int(c.get("index"))
        except (TypeError, ValueError):
            idx = None
        j = judgment_map.get(idx) if idx is not None else None
        if j:
            c["employment_type"] = j["employment_type"]
            c["employment_type_reason"] = j["employment_type_reason"]
        else:
            c["employment_type"] = "unknown"
            c["employment_type_reason"] = "AI 판정 누락"

    # Attach any new_flags emitted by the AI.
    new_flags = ai_output.get("new_flags") or []
    if new_flags:
        employment_result.setdefault("verification_summary", [])
        employment_result["verification_summary"].extend(new_flags)

    if not result_careers:
        return employment_result

    single_project_companies: list[str] = analysis.get("single_project_companies", [])
    company_analyses: list[dict[str, Any]] = analysis.get("company_analyses", [])

    # --- Pattern 1: ≥3 distinct single-project companies → contract. ---
    if len(single_project_companies) >= 3:
        single_set = {norm_name(n) for n in single_project_companies}
        for c in result_careers:
            if norm_name(c.get("company_name")) in single_set:
                if c.get("employment_type") != "contract":
                    _set_employment(
                        c,
                        "contract",
                        f"코드 강제: {len(single_project_companies)}개 회사에서 "
                        "각 1건만 수행 — 현장 프로젝트직 패턴",
                    )

    # --- Pattern 2: same company with ≥2 work_history entries → contract,
    # unless any WH window has ≥2 projects & total_days > 730 → regular. ---
    now_ms = _now_ms()
    for ca in company_analyses:
        if ca.get("work_history_entries", 0) < 2:
            continue
        comp_key = norm_name(ca.get("company_name"))
        wh_entries_raw = cert_work_history or []
        wh_ranges: list[dict[str, int]] = []
        for wh in wh_entries_raw:
            if norm_name(wh.get("company_name")) != comp_key:
                continue
            start = _to_ms(wh.get("period_start"))
            end = _to_ms(wh.get("period_end")) if wh.get("period_end") else now_ms
            if start is None or end is None:
                continue
            wh_ranges.append({"start": start, "end": end})

        for c in result_careers:
            if norm_name(c.get("company_name")) != comp_key:
                continue
            c_start = _to_ms(c.get("period_start"))
            c_end = _to_ms(c.get("period_end"))
            belongs_to: dict[str, int] | None = None
            if c_start is not None and c_end is not None:
                for wh in wh_ranges:
                    if c_start >= wh["start"] - _DAY_MS and c_end <= wh["end"] + _DAY_MS:
                        belongs_to = wh
                        break

            if belongs_to is not None:
                same_wh_projects = []
                for rc in result_careers:
                    if norm_name(rc.get("company_name")) != comp_key:
                        continue
                    rc_start = _to_ms(rc.get("period_start"))
                    rc_end = _to_ms(rc.get("period_end"))
                    if rc_start is None or rc_end is None:
                        continue
                    if (
                        rc_start >= belongs_to["start"] - _DAY_MS
                        and rc_end <= belongs_to["end"] + _DAY_MS
                    ):
                        same_wh_projects.append(rc)
                project_count = len(same_wh_projects)
                total_days = sum(
                    int(p.get("working_days") or 0) for p in same_wh_projects
                )

                if project_count >= 2 and total_days > 730:
                    if c.get("employment_type") == "contract":
                        _set_employment(
                            c,
                            "regular",
                            "코드 보정: WH 끊김이지만 해당 재직기간 프로젝트 "
                            f"{project_count}건 합산 {total_days}일(2년 초과) — 정규직 유지",
                        )
                    continue

            # Otherwise force contract.
            if c.get("employment_type") != "contract":
                _set_employment(
                    c,
                    "contract",
                    f"코드 강제: work_history {ca.get('work_history_entries')}건 "
                    "끊어져 반복 — 고용 단절 패턴",
                )

    # --- Pattern 3 / 4: compute contract ratio on the post-AI snapshot. ---
    total_careers = len(result_careers)
    contract_count = sum(
        1 for c in result_careers if c.get("employment_type") == "contract"
    )
    contract_ratio = contract_count / total_careers if total_careers > 0 else 0.0

    if contract_ratio >= 0.4:
        # Pattern 3: company with ≥2 cert projects & ≤ 730 days total → contract.
        for ca in company_analyses:
            if ca.get("cert_career_count", 0) >= 2 and ca.get("cert_total_days", 0) <= 730:
                comp_key = norm_name(ca.get("company_name"))
                for c in result_careers:
                    if norm_name(c.get("company_name")) == comp_key:
                        if c.get("employment_type") != "contract":
                            _set_employment(
                                c,
                                "contract",
                                f"코드 강제: 경력증명서 프로젝트 {ca.get('cert_career_count')}건 "
                                f"합산 {ca.get('cert_total_days')}일(2년 이내) + "
                                f"전체 비정규직 비율 {round(contract_ratio * 100)}%",
                            )

        # Pattern 4: resume_only source in a cert-covered company → contract.
        cert_companies: set[str] = set()
        for ca in company_analyses:
            if ca.get("cert_career_count", 0) > 0:
                cert_companies.add(norm_name(ca.get("company_name")))
        for c in result_careers:
            if (
                c.get("source") == "resume_only"
                and norm_name(c.get("company_name")) in cert_companies
            ):
                if c.get("employment_type") != "contract":
                    _set_employment(
                        c,
                        "contract",
                        "코드 강제: 이력서만 있는 경력 — 같은 회사 경력증명서 경력 존재 + "
                        f"전체 비정규직 비율 {round(contract_ratio * 100)}%",
                    )

    return employment_result


# ---------------------------------------------------------------------------
# Orchestrator.
# ---------------------------------------------------------------------------


async def run_employment(
    merge_result: dict[str, Any],
    cert_work_history: list[dict[str, Any]] | None,
    prompts: tuple[str, str],
) -> dict[str, Any]:
    """End-to-end orchestrator: analysis → AI → code enforcement."""
    careers = merge_result.get("merged_careers") or []
    analysis = analyze_career_patterns(careers, cert_work_history)

    ai_output = await call_ai(merge_result, analysis, prompts)
    employment_result = enforce_patterns(
        ai_output, analysis, merge_result, cert_work_history
    )

    _debug_log(analysis, employment_result)
    return employment_result


def _debug_log(analysis: dict[str, Any], employment_result: dict[str, Any]) -> None:
    """Mirror the TS DEBUG console.log gate."""
    from app.core.config import get_settings

    if not get_settings().debug:
        return
    careers = employment_result.get("merged_careers") or []
    lines: list[str] = ["=== 코드 사전 분석 ==="]
    for a in analysis.get("company_analyses", []):
        lines.append(
            f"{a.get('company_name')}: wh={a.get('work_history_entries')}건, "
            f"gaps={len(a.get('project_gaps', []))} → {a.get('judgment')}"
        )
    lines.append("")
    lines.append("=== AI 판정 결과 ===")
    for c in careers:
        lines.append(
            f"#{c.get('index')} {c.get('company_name')}: {c.get('employment_type')}\n"
            f"  사유: {c.get('employment_type_reason')}"
        )
    logger.debug("[employment debug]\n%s", "\n".join(lines))
