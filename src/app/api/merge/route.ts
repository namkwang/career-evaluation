import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithSearch } from "@/lib/anthropic";
import { getStep2Prompt } from "@/lib/prompts";
import { filterRankings } from "@/lib/ranking";

function extractCompaniesAndYears(
  resumeData: { careers?: Array<{ company_name: string; period_start: string; period_end?: string | null }> },
  certificateData: { technical_career?: Array<{ company_name?: string; project_name: string; period_start: string; period_end: string }> } | null
): { name: string; years: number[] }[] {
  const companyYears = new Map<string, Set<number>>();

  const addCompanyYear = (name: string, start: string, end?: string | null) => {
    if (!companyYears.has(name)) {
      companyYears.set(name, new Set());
    }
    const startYear = parseInt(start.substring(0, 4));
    const endYear = end ? parseInt(end.substring(0, 4)) : new Date().getFullYear();
    if (!isNaN(startYear)) {
      for (let y = startYear; y <= endYear; y++) {
        companyYears.get(name)!.add(y);
      }
    }
  };

  if (resumeData.careers) {
    for (const c of resumeData.careers) {
      addCompanyYear(c.company_name, c.period_start, c.period_end);
    }
  }

  if (certificateData?.technical_career) {
    for (const tc of certificateData.technical_career) {
      if (tc.company_name) {
        addCompanyYear(tc.company_name, tc.period_start, tc.period_end);
      }
    }
  }

  return Array.from(companyYears.entries()).map(([name, years]) => ({
    name,
    years: Array.from(years),
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resumeData, certificateData, applied_field, hiring_type } = body;

    // Step 1-C: Filter rankings
    const companies = extractCompaniesAndYears(resumeData, certificateData);
    const rankingMatches = filterRankings(companies);

    // 코드에서 도급순위 기반 회사유형을 사전 확정
    // AI에게는 확정 결과를 전달하고, 도급순위에 없는 회사만 AI가 판단
    const norm = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");

    // 회사별 연도별 순위 맵
    const rankByCompanyYear = new Map<string, Map<number, number>>();
    for (const r of rankingMatches) {
      const key = norm(r.matched_name);
      if (!rankByCompanyYear.has(key)) rankByCompanyYear.set(key, new Map());
      rankByCompanyYear.get(key)!.set(r.year, r.rank);
    }

    // 회사명+연도 → category 결정 함수
    function resolveCategory(companyName: string, startYear: number): { category: string; rank: number; year: number } | null {
      const key = norm(companyName);
      const yearMap = rankByCompanyYear.get(key);
      if (!yearMap) return null;

      // 해당 연도 순위 → 없으면 가장 가까운 연도
      let rank = yearMap.get(startYear);
      let matchYear = startYear;
      if (rank === undefined) {
        const years = [...yearMap.keys()].sort((a, b) => Math.abs(a - startYear) - Math.abs(b - startYear));
        if (years.length === 0) return null;
        matchYear = years[0];
        rank = yearMap.get(matchYear)!;
      }
      return {
        category: rank <= 100 ? "general_top100" : "general_outside100",
        rank,
        year: matchYear,
      };
    }

    // AI에게 전달할 텍스트: 확정된 회사와 미확정 회사를 구분
    let rankingText: string;
    if (rankingMatches.length > 0) {
      const byCompany = new Map<string, typeof rankingMatches>();
      for (const r of rankingMatches) {
        const key = r.matched_name;
        if (!byCompany.has(key)) byCompany.set(key, []);
        byCompany.get(key)!.push(r);
      }
      rankingText = "아래 회사들은 도급순위 데이터로 회사유형이 코드에서 확정되었습니다. AI가 변경하지 마세요.\n" +
        Array.from(byCompany.entries()).map(([name, matches]) => {
          const sorted = [...matches].sort((a, b) => a.year - b.year);
          const years = sorted.map(m => `${m.year}년=${m.rank}위`).join(", ");
          return `[${name}] ${years}`;
        }).join("\n") +
        "\n\n도급순위에 없는 회사만 웹 검색으로 업종을 확인하세요.";
    } else {
      rankingText = "도급순위에서 매칭되는 회사가 없습니다. 모든 회사를 웹 검색으로 확인하세요.";
    }

    const { systemPrompt, userPrompt } = getStep2Prompt();

    const filledUserPrompt = userPrompt
      .replace("{지원 직무}", applied_field)
      .replace("{일반 / 전문직 / 현채직}", hiring_type)
      .replace(
        '{경력증명서 JSON 또는 "미제출"}',
        certificateData ? JSON.stringify(certificateData, null, 2) : "미제출"
      )
      .replace("{이력서 JSON}", JSON.stringify(resumeData, null, 2))
      .replace(
        "{코드가 사전 필터링한 해당 연도별 순위 리스트}",
        rankingText
      );

    const mergeResult = await callGeminiWithSearch(
      systemPrompt,
      filledUserPrompt
    );

    // AI 출력 후처리
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mergeResult as any;
    if (result?.merged_careers) {
      // 연속근무 필드 제거
      result.continuous_groups = [];
      for (const c of result.merged_careers) {
        c.continuous_group_id = null;
      }

      // --- 핵심 검증: 경력증명서 work_history 기간 밖 경력 제거 ---
      const norm = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");

      // 경력증명서 work_history 기간 수집
      const certWH: Array<{ company_name: string; period_start: string; period_end: string | null }> = certificateData?.work_history ?? [];
      const whPeriods = new Map<string, Array<{ start: number; end: number }>>();
      for (const wh of certWH) {
        const key = norm(wh.company_name);
        if (!whPeriods.has(key)) whPeriods.set(key, []);
        whPeriods.get(key)!.push({
          start: new Date(wh.period_start).getTime(),
          end: wh.period_end ? new Date(wh.period_end).getTime() : Date.now(),
        });
      }

      // 경력증명서에 있는 회사는 work_history 기간 안의 경력만 유지
      const removed: Array<{ company_name: string }> = [];
      if (whPeriods.size > 0) {
        result.merged_careers = result.merged_careers.filter((c: { company_name: string; period_start: string; period_end: string }) => {
          const key = norm(c.company_name);
          const periods = whPeriods.get(key);
          if (!periods) return true; // 경력증명서에 없는 회사 → 이력서 전용, 유지

          const cStart = new Date(c.period_start).getTime();
          const cEnd = new Date(c.period_end).getTime();
          const covered = periods.some(p => cStart >= p.start - 86400000 && cEnd <= p.end + 86400000);
          if (!covered) {
            removed.push({ company_name: c.company_name });
            return false;
          }
          return true;
        });
      }

      // 인덱스 재정렬
      result.merged_careers.forEach((c: { index: number }, i: number) => { c.index = i + 1; });

      // 플래그 추가
      if (removed.length > 0) {
        if (!result.verification_summary) result.verification_summary = [];
        const uniqueCompanies = [...new Set(removed.map(r => r.company_name))];
        for (const companyName of uniqueCompanies) {
          result.verification_summary.push({
            flag_type: "AI 병합 오류 보정",
            related_career_index: null,
            description: `${companyName}에 대해 원본 서류에 없는 경력이 병합 과정에서 생성되어 제거했습니다. 경력증명서 기준으로 산정합니다.`,
            requires_interview: false,
          });
        }
      }
    }

    // --- 경력증명서 발급일 기반 경력 보완 ---
    if (certificateData?.document_info?.issue_date && result?.merged_careers) {
      const issueDateStr = certificateData.document_info.issue_date;
      const issueDate = new Date(issueDateStr);

      if (!isNaN(issueDate.getTime())) {
        if (!result.verification_summary) result.verification_summary = [];
        const today = new Date();
        const daysSinceIssue = Math.floor((today.getTime() - issueDate.getTime()) / 86400000);

        // 1-2. 발급일 경과 경고 (6개월 이상)
        if (daysSinceIssue > 180) {
          result.verification_summary.push({
            flag_type: "cert_issue_date_stale",
            related_career_index: null,
            description: `경력증명서 발급일(${issueDateStr})로부터 ${daysSinceIssue}일 경과. 최근 경력이 반영되지 않았을 수 있습니다.`,
            requires_interview: false,
          });
        }

        // 1-3. 절삭 경력 감지 + 보완
        const issueDateMs = issueDate.getTime();
        const DAY = 86400000;
        const normN = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");

        // WH 중 재직중(period_end=null)인 회사 수집
        const issueWH: Array<{ company_name: string; period_start: string; period_end: string | null }> = certificateData?.work_history ?? [];
        const currentlyEmployed = new Set<string>();
        for (const wh of issueWH) {
          if (wh.period_end === null) currentlyEmployed.add(normN(wh.company_name));
        }

        // 이력서 경력 (보완 소스)
        const resumeCareers: Array<{ company_name: string; period_start: string; period_end?: string | null }> =
          resumeData?.careers ?? [];

        // 재직중 회사별로 가장 최근 경력(마지막 period_end)만 보완 대상
        const latestByCompany = new Map<string, { index: number; period_end: string; periodEndMs: number }>();
        for (const career of result.merged_careers) {
          if (!career.period_end) continue;
          const compKey = normN(career.company_name);
          if (!currentlyEmployed.has(compKey)) continue;
          const periodEndMs = new Date(career.period_end).getTime();
          const existing = latestByCompany.get(compKey);
          if (!existing || periodEndMs > existing.periodEndMs) {
            latestByCompany.set(compKey, { index: career.index, period_end: career.period_end, periodEndMs });
          }
        }

        for (const career of result.merged_careers) {
          if (!career.period_end) continue;
          const periodEndMs = new Date(career.period_end).getTime();
          const compKey = normN(career.company_name);

          // 해당 회사의 마지막 경력만 보완 대상
          const latest = latestByCompany.get(compKey);
          if (!latest || career.index !== latest.index) continue;

          // 발급일 이전에 끝나는 마지막 경력 AND 해당 회사가 재직중
          if (periodEndMs <= issueDateMs + DAY && currentlyEmployed.has(compKey)) {
            // 이력서에서 같은 회사 매칭 (기간 겹치는 것)
            const resumeMatch = resumeCareers.find(rc => {
              const rcKey = normN(rc.company_name);
              if (rcKey !== compKey) return false;
              // 이력서 경력이 경력증명서 경력보다 늦게 끝나는 것
              if (!rc.period_end) return true; // 이력서에서도 재직중
              return new Date(rc.period_end).getTime() > periodEndMs;
            });

            if (resumeMatch) {
              // 이력서 기간으로 보완
              const newEnd = resumeMatch.period_end ?? today.toISOString().slice(0, 10);
              const oldEnd = career.period_end;
              career.period_end = newEnd;
              // working_days 재계산
              const startMs = new Date(career.period_start).getTime();
              const endMs = new Date(newEnd).getTime();
              career.working_days = Math.round((endMs - startMs) / DAY) + 1;
              career.period_supplemented = true;

              const source = resumeMatch.period_end ? `이력서 기간(~${resumeMatch.period_end})` : `분석일(${today.toISOString().slice(0, 10)}) 기준 재직중`;
              result.verification_summary.push({
                flag_type: "cert_period_supplemented",
                related_career_index: career.index,
                description: `${career.company_name}의 경력이 경력증명서 발급일(${issueDateStr})에서 잘려 있어 ${source}으로 보완했습니다. (${oldEnd} → ${newEnd})`,
                requires_interview: false,
              });
            } else {
              // 이력서에도 없지만 WH가 재직중 → 분석 당일까지
              const oldEnd = career.period_end;
              const newEnd = today.toISOString().slice(0, 10);
              career.period_end = newEnd;
              const startMs = new Date(career.period_start).getTime();
              const endMs = new Date(newEnd).getTime();
              career.working_days = Math.round((endMs - startMs) / DAY) + 1;
              career.period_supplemented = true;

              result.verification_summary.push({
                flag_type: "cert_period_supplemented",
                related_career_index: career.index,
                description: `${career.company_name}의 경력이 경력증명서 발급일(${issueDateStr})에서 잘려 있어 분석일(${newEnd}) 기준 재직중으로 보완했습니다. (${oldEnd} → ${newEnd})`,
                requires_interview: false,
              });
            }
          }
        }

        // 1-4. 발급일 이후 resume_only 경력 플래그
        for (const career of result.merged_careers) {
          if (career.source !== "resume_only") continue;
          const periodStartMs = new Date(career.period_start).getTime();
          if (periodStartMs > issueDateMs) {
            result.verification_summary.push({
              flag_type: "post_issue_date_career",
              related_career_index: career.index,
              description: `${career.company_name}의 경력(${career.period_start}~${career.period_end})은 경력증명서 발급일(${issueDateStr}) 이후입니다. 경력증명서로 검증 불가하며, 별도 재직증명서가 필요합니다.`,
              requires_interview: true,
            });
          }
        }
      }
    }

    // 코드에서 도급순위 매칭 회사의 company_category를 강제 확정
    const fs = await import("fs");
    const debugLines: string[] = ["=== merge API 도급순위 보정 ==="];

    if (result?.merged_careers) {
      for (const career of result.merged_careers) {
        const startYear = parseInt(career.period_start?.substring(0, 4));
        if (isNaN(startYear)) continue;

        const resolved = resolveCategory(career.company_name, startYear);
        const before = career.company_category;
        if (resolved) {
          career.company_category = resolved.category;
          career.ranking_year = resolved.year;
          career.ranking_position = resolved.rank;
          career.company_category_reason = `${resolved.year}년 시공능력평가 ${resolved.rank}위 (코드 확정)`;
          debugLines.push(`#${career.index} ${career.company_name} (${startYear}): AI=${before} → 코드=${resolved.category} (${resolved.year}년 ${resolved.rank}위)`);
        } else {
          debugLines.push(`#${career.index} ${career.company_name} (${startYear}): 도급순위 매칭 없음 → AI값 유지: ${before}`);
        }
      }
    }
    fs.writeFileSync("merge_debug.log", debugLines.join("\n"), "utf-8");

    return NextResponse.json({ mergeResult: result, rankingMatches });
  } catch (error) {
    console.error("Merge error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "병합 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
