"""Pure business-logic port of src/app/api/merge/route.ts.

No FastAPI imports. Three-stage pipeline:

* ``prepare()`` — pre-computes ranking matches + pre-confirms company_category
  so the AI cannot override it.
* ``ai_enrich()`` — calls Gemini (Step 2 prompt) with the prepared context.
* ``post_process()`` — phantom-career removal, stale-cert + supplemented-period
  flagging, and ranking-based company_category overrides (code wins over AI).

The TS source uses JS epoch milliseconds for every date comparison. We keep ms
here too to match the ``cStart >= p.start - 86400000`` tolerance exactly. ISO
strings would also sort correctly, but reproducing the ±1-day tolerance in pure
string math is fragile — ms is the closest parity.
"""

from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from typing import Any

from app.core import gemini, prompts, ranking
from app.core.normalize import norm_name

logger = logging.getLogger("career_evaluation.merge")

DAY_MS = 86_400_000
STALE_CERT_DAYS = 180  # TS: `daysSinceIssue > 180`


def _parse_date_ms(s: Any) -> float:
    """Port of ``new Date(s).getTime()``; returns NaN on failure."""
    if not isinstance(s, str) or not s:
        return math.nan
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return math.nan
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _extract_companies_and_years(
    resume_data: dict[str, Any],
    certificate_data: dict[str, Any] | None,
) -> list[ranking.CompanyYears]:
    """Port of extractCompaniesAndYears."""
    company_years: dict[str, set[int]] = {}
    current_year = datetime.now(timezone.utc).year

    def add(name: str, start: str, end: str | None) -> None:
        if not name or not start:
            return
        try:
            start_year = int(start[:4])
        except (ValueError, TypeError):
            return
        try:
            end_year = int(end[:4]) if end else current_year
        except (ValueError, TypeError):
            end_year = current_year
        company_years.setdefault(name, set()).update(range(start_year, end_year + 1))

    for c in resume_data.get("careers") or []:
        add(c.get("company_name"), c.get("period_start"), c.get("period_end"))

    if certificate_data:
        for tc in certificate_data.get("technical_career") or []:
            if tc.get("company_name"):
                add(tc.get("company_name"), tc.get("period_start"), tc.get("period_end"))

    return [{"name": n, "years": sorted(ys)} for n, ys in company_years.items()]


def _build_rank_by_company_year(
    matches: list[ranking.RankingMatch],
) -> dict[str, dict[int, int]]:
    rank_map: dict[str, dict[int, int]] = {}
    for m in matches:
        key = norm_name(m["matched_name"])
        rank_map.setdefault(key, {})[m["year"]] = m["rank"]
    return rank_map


def _resolve_category(
    rank_by_company_year: dict[str, dict[int, int]],
    company_name: str,
    start_year: int,
) -> dict[str, Any] | None:
    """Port of resolveCategory; returns None if no ranking match."""
    key = norm_name(company_name)
    year_map = rank_by_company_year.get(key)
    if not year_map:
        return None
    rank = year_map.get(start_year)
    match_year = start_year
    if rank is None:
        years = sorted(year_map.keys(), key=lambda y: abs(y - start_year))
        if not years:
            return None
        match_year = years[0]
        rank = year_map[match_year]
    category = "general_top100" if rank <= 100 else "general_outside100"
    return {"category": category, "rank": rank, "year": match_year}


def _build_ranking_text(matches: list[ranking.RankingMatch]) -> str:
    if not matches:
        return "도급순위에서 매칭되는 회사가 없습니다. 모든 회사를 웹 검색으로 확인하세요."

    by_company: dict[str, list[ranking.RankingMatch]] = {}
    for r in matches:
        by_company.setdefault(r["matched_name"], []).append(r)

    lines = []
    for name, items in by_company.items():
        sorted_items = sorted(items, key=lambda m: m["year"])
        years_str = ", ".join(f"{m['year']}년={m['rank']}위" for m in sorted_items)
        lines.append(f"[{name}] {years_str}")

    return (
        "아래 회사들은 도급순위 데이터로 회사유형이 코드에서 확정되었습니다. "
        "AI가 변경하지 마세요.\n"
        + "\n".join(lines)
        + "\n\n도급순위에 없는 회사만 웹 검색으로 업종을 확인하세요."
    )


async def prepare(
    resume_data: dict[str, Any],
    certificate_data: dict[str, Any] | None,
    applied_field: str,
    hiring_type: str,
) -> dict[str, Any]:
    """Stage 1: ranking filter + pre-confirmation. Pure, no AI call."""
    companies = _extract_companies_and_years(resume_data, certificate_data)
    ranking_matches = ranking.filter_rankings(companies)
    rank_by_company_year = _build_rank_by_company_year(ranking_matches)
    ranking_text = _build_ranking_text(ranking_matches)

    return {
        "resume_data": resume_data,
        "certificate_data": certificate_data,
        "applied_field": applied_field,
        "hiring_type": hiring_type,
        "ranking_matches": ranking_matches,
        "rank_by_company_year": rank_by_company_year,
        "ranking_text": ranking_text,
    }


async def ai_enrich(prepared: dict[str, Any]) -> dict[str, Any]:
    """Stage 2: call Gemini with Step 2 prompts + prepared context."""
    system_prompt, user_prompt_tpl = prompts.step2_merge()

    cert = prepared["certificate_data"]
    cert_json = json.dumps(cert, ensure_ascii=False, indent=2) if cert else "미제출"
    resume_json = json.dumps(prepared["resume_data"], ensure_ascii=False, indent=2)

    filled = (
        user_prompt_tpl.replace("{지원 직무}", prepared["applied_field"])
        .replace("{일반 / 전문직 / 현채직}", prepared["hiring_type"])
        .replace('{경력증명서 JSON 또는 "미제출"}', cert_json)
        .replace("{이력서 JSON}", resume_json)
        .replace(
            "{코드가 사전 필터링한 해당 연도별 순위 리스트}", prepared["ranking_text"]
        )
    )

    raw = await gemini.call_gemini_with_search(system_prompt, filled)
    parsed = gemini.parse_json_response(raw)
    if not isinstance(parsed, dict):
        raise ValueError("merge AI returned non-object JSON")
    return parsed


async def post_process(
    ai_result: dict[str, Any],
    resume_data: dict[str, Any],
    certificate_data: dict[str, Any] | None,
    rank_by_company_year: dict[str, dict[int, int]],
) -> dict[str, Any]:
    """Stage 3: phantom-career removal + stale/supplement/post-issue flags +
    ranking-based company_category overrides. Mutates and returns ai_result."""
    result = ai_result

    merged: list[dict[str, Any]] = result.get("merged_careers") or []
    if merged:
        # Drop continuous-work fields — Step 2 prompt says not to emit them.
        result["continuous_groups"] = []
        for c in merged:
            c["continuous_group_id"] = None

        # --- Phantom-career removal: drop resume-only careers outside cert WH periods ---
        cert_wh: list[dict[str, Any]] = (
            (certificate_data or {}).get("work_history") or []
        )
        wh_periods: dict[str, list[tuple[float, float]]] = {}
        now_ms = _now_ms()
        for wh in cert_wh:
            key = norm_name(wh.get("company_name") or "")
            start_ms = _parse_date_ms(wh.get("period_start"))
            if not math.isfinite(start_ms):
                continue
            end = wh.get("period_end")
            end_ms = _parse_date_ms(end) if end else float(now_ms)
            if not math.isfinite(end_ms):
                end_ms = float(now_ms)
            wh_periods.setdefault(key, []).append((start_ms, end_ms))

        removed: list[dict[str, Any]] = []
        if wh_periods:
            kept: list[dict[str, Any]] = []
            for c in merged:
                key = norm_name(c.get("company_name") or "")
                periods = wh_periods.get(key)
                if not periods:
                    # Company not in cert work_history → resume-only, keep.
                    kept.append(c)
                    continue
                c_start = _parse_date_ms(c.get("period_start"))
                c_end = _parse_date_ms(c.get("period_end"))
                if not math.isfinite(c_start) or not math.isfinite(c_end):
                    kept.append(c)
                    continue
                covered = any(
                    c_start >= p_start - DAY_MS and c_end <= p_end + DAY_MS
                    for p_start, p_end in periods
                )
                if covered:
                    kept.append(c)
                else:
                    removed.append({"company_name": c.get("company_name")})
            merged = kept
            result["merged_careers"] = merged

        # Re-index
        for i, c in enumerate(merged):
            c["index"] = i + 1

        if removed:
            result.setdefault("verification_summary", [])
            unique_companies: list[str] = []
            for r in removed:
                name = r["company_name"]
                if name and name not in unique_companies:
                    unique_companies.append(name)
            for name in unique_companies:
                result["verification_summary"].append(
                    {
                        "flag_type": "AI 병합 오류 보정",
                        "related_career_index": None,
                        "description": (
                            f"{name}에 대해 원본 서류에 없는 경력이 병합 과정에서 "
                            "생성되어 제거했습니다. 경력증명서 기준으로 산정합니다."
                        ),
                        "requires_interview": False,
                    }
                )

    # --- Cert issue-date-based supplementation ---
    doc_info = (certificate_data or {}).get("document_info") or {}
    issue_date_str = doc_info.get("issue_date")
    merged = result.get("merged_careers") or []

    if issue_date_str and merged:
        issue_date_ms = _parse_date_ms(issue_date_str)
        if math.isfinite(issue_date_ms):
            result.setdefault("verification_summary", [])
            today_ms = _now_ms()
            days_since_issue = int((today_ms - issue_date_ms) // DAY_MS)

            # Stale cert warning
            if days_since_issue > STALE_CERT_DAYS:
                result["verification_summary"].append(
                    {
                        "flag_type": "cert_issue_date_stale",
                        "related_career_index": None,
                        "description": (
                            f"경력증명서 발급일({issue_date_str})로부터 "
                            f"{days_since_issue}일 경과. 최근 경력이 반영되지 "
                            "않았을 수 있습니다."
                        ),
                        "requires_interview": False,
                    }
                )

            # Truncated-career supplementation (cert issued mid-career)
            issue_wh: list[dict[str, Any]] = (
                (certificate_data or {}).get("work_history") or []
            )
            currently_employed: set[str] = {
                norm_name(w.get("company_name") or "")
                for w in issue_wh
                if w.get("period_end") is None
            }
            resume_careers: list[dict[str, Any]] = resume_data.get("careers") or []

            # Find the latest career per currently-employed company.
            latest_by_company: dict[str, dict[str, Any]] = {}
            for career in merged:
                if not career.get("period_end"):
                    continue
                comp_key = norm_name(career.get("company_name") or "")
                if comp_key not in currently_employed:
                    continue
                period_end_ms = _parse_date_ms(career.get("period_end"))
                if not math.isfinite(period_end_ms):
                    continue
                existing = latest_by_company.get(comp_key)
                if existing is None or period_end_ms > existing["periodEndMs"]:
                    latest_by_company[comp_key] = {
                        "index": career.get("index"),
                        "period_end": career.get("period_end"),
                        "periodEndMs": period_end_ms,
                    }

            today_iso = _today_iso()
            for career in merged:
                if not career.get("period_end"):
                    continue
                period_end_ms = _parse_date_ms(career.get("period_end"))
                if not math.isfinite(period_end_ms):
                    continue
                comp_key = norm_name(career.get("company_name") or "")
                latest = latest_by_company.get(comp_key)
                if not latest or career.get("index") != latest["index"]:
                    continue
                if (
                    period_end_ms <= issue_date_ms + DAY_MS
                    and comp_key in currently_employed
                ):
                    resume_match: dict[str, Any] | None = None
                    for rc in resume_careers:
                        if norm_name(rc.get("company_name") or "") != comp_key:
                            continue
                        rc_end = rc.get("period_end")
                        if not rc_end:
                            resume_match = rc
                            break
                        rc_end_ms = _parse_date_ms(rc_end)
                        if math.isfinite(rc_end_ms) and rc_end_ms > period_end_ms:
                            resume_match = rc
                            break

                    if resume_match is not None:
                        new_end = resume_match.get("period_end") or today_iso
                        old_end = career.get("period_end")
                        career["period_end"] = new_end
                        start_ms = _parse_date_ms(career.get("period_start"))
                        end_ms = _parse_date_ms(new_end)
                        if math.isfinite(start_ms) and math.isfinite(end_ms):
                            career["working_days"] = (
                                int(round((end_ms - start_ms) / DAY_MS)) + 1
                            )
                        career["period_supplemented"] = True
                        source = (
                            f"이력서 기간(~{resume_match['period_end']})"
                            if resume_match.get("period_end")
                            else f"분석일({today_iso}) 기준 재직중"
                        )
                        result["verification_summary"].append(
                            {
                                "flag_type": "cert_period_supplemented",
                                "related_career_index": career.get("index"),
                                "description": (
                                    f"{career.get('company_name')}의 경력이 "
                                    f"경력증명서 발급일({issue_date_str})에서 "
                                    f"잘려 있어 {source}으로 보완했습니다. "
                                    f"({old_end} → {new_end})"
                                ),
                                "requires_interview": False,
                            }
                        )
                    else:
                        old_end = career.get("period_end")
                        new_end = today_iso
                        career["period_end"] = new_end
                        start_ms = _parse_date_ms(career.get("period_start"))
                        end_ms = _parse_date_ms(new_end)
                        if math.isfinite(start_ms) and math.isfinite(end_ms):
                            career["working_days"] = (
                                int(round((end_ms - start_ms) / DAY_MS)) + 1
                            )
                        career["period_supplemented"] = True
                        result["verification_summary"].append(
                            {
                                "flag_type": "cert_period_supplemented",
                                "related_career_index": career.get("index"),
                                "description": (
                                    f"{career.get('company_name')}의 경력이 "
                                    f"경력증명서 발급일({issue_date_str})에서 "
                                    f"잘려 있어 분석일({new_end}) 기준 재직중으로 "
                                    f"보완했습니다. ({old_end} → {new_end})"
                                ),
                                "requires_interview": False,
                            }
                        )

            # Post-issue resume-only careers flag
            for career in merged:
                if career.get("source") != "resume_only":
                    continue
                period_start_ms = _parse_date_ms(career.get("period_start"))
                if not math.isfinite(period_start_ms):
                    continue
                if period_start_ms > issue_date_ms:
                    result["verification_summary"].append(
                        {
                            "flag_type": "post_issue_date_career",
                            "related_career_index": career.get("index"),
                            "description": (
                                f"{career.get('company_name')}의 경력"
                                f"({career.get('period_start')}~"
                                f"{career.get('period_end')})은 경력증명서 "
                                f"발급일({issue_date_str}) 이후입니다. "
                                "경력증명서로 검증 불가하며, 별도 재직증명서가 "
                                "필요합니다."
                            ),
                            "requires_interview": True,
                        }
                    )

    # --- Ranking-based company_category override (code wins over AI) ---
    merged = result.get("merged_careers") or []
    for career in merged:
        start_raw = career.get("period_start") or ""
        try:
            start_year = int(start_raw[:4])
        except (ValueError, TypeError):
            continue
        resolved = _resolve_category(
            rank_by_company_year, career.get("company_name") or "", start_year
        )
        if resolved is None:
            continue
        career["company_category"] = resolved["category"]
        career["ranking_year"] = resolved["year"]
        career["ranking_position"] = resolved["rank"]
        career["company_category_reason"] = (
            f"{resolved['year']}년 시공능력평가 {resolved['rank']}위 (코드 확정)"
        )

    return result


async def run_merge(
    resume_data: dict[str, Any],
    certificate_data: dict[str, Any] | None,
    applied_field: str,
    hiring_type: str,
) -> dict[str, Any]:
    """Full pipeline: prepare → ai_enrich → post_process."""
    prepared = await prepare(resume_data, certificate_data, applied_field, hiring_type)
    ai_result = await ai_enrich(prepared)
    final_result = await post_process(
        ai_result,
        resume_data,
        certificate_data,
        prepared["rank_by_company_year"],
    )
    return {
        "mergeResult": final_result,
        "rankingMatches": prepared["ranking_matches"],
    }
