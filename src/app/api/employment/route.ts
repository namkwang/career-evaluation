import { NextRequest, NextResponse } from "next/server";
import { callGemini } from "@/lib/anthropic";
import { getStep3Prompt } from "@/lib/prompts";

interface Career {
  index: number;
  company_name: string;
  project_name: string | null;
  period_start: string;
  period_end: string;
  working_days: number;
  position_raw: string | null;
  continuous_group_id?: string | null;
  source: string;
}

interface WorkHistory {
  period_start: string;
  period_end: string | null;
  company_name: string;
  company_name_current: string | null;
}

interface CompanyAnalysis {
  company_name: string;
  career_count: number;
  cert_career_count: number;
  cert_total_days: number;
  total_days: number;
  work_history_entries: number;
  work_history_continuous: boolean;
  project_gaps: Array<{ between: string; gap_days: number }>;
  judgment: string;
}

function normalize(s: string) {
  return s.replace(/\(주\)|㈜|주식회사|\s/g, "");
}

function analyzeCareerPatterns(careers: Career[], workHistory: WorkHistory[] | null) {
  // 회사별 경력 그룹핑
  const byCompany = new Map<string, Career[]>();
  for (const c of careers) {
    const key = normalize(c.company_name);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(c);
  }

  // 회사별 work_history 그룹핑 (사명 변경 고려)
  // 같은 회사의 다른 이름들을 하나의 그룹으로 통합
  const whByCompany = new Map<string, WorkHistory[]>();
  const nameAliases = new Map<string, string>(); // altKey → primaryKey
  if (workHistory) {
    for (const wh of workHistory) {
      const key = normalize(wh.company_name);
      // company_name_current가 있으면 alias 등록
      if (wh.company_name_current) {
        const altKey = normalize(wh.company_name_current);
        // 두 이름을 하나의 primary key로 통합
        const existingPrimary = nameAliases.get(key) ?? nameAliases.get(altKey) ?? key;
        nameAliases.set(key, existingPrimary);
        nameAliases.set(altKey, existingPrimary);
      }
    }
    for (const wh of workHistory) {
      const key = normalize(wh.company_name);
      const primaryKey = nameAliases.get(key) ?? key;
      if (!whByCompany.has(primaryKey)) whByCompany.set(primaryKey, []);
      whByCompany.get(primaryKey)!.push(wh);
    }
  }

  const companyAnalyses: CompanyAnalysis[] = [];

  for (const [key, companyCareers] of byCompany) {
    const sorted = [...companyCareers].sort((a, b) => a.period_start.localeCompare(b.period_start));

    // 프로젝트 간 공백 계산
    const projectGaps: Array<{ between: string; gap_days: number }> = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const end = new Date(sorted[i].period_end);
      const nextStart = new Date(sorted[i + 1].period_start);
      const gapDays = Math.round((nextStart.getTime() - end.getTime()) / 86400000) - 1;
      if (gapDays > 0) {
        projectGaps.push({
          between: `#${sorted[i].index}(~${sorted[i].period_end}) → #${sorted[i + 1].index}(${sorted[i + 1].period_start}~)`,
          gap_days: gapDays,
        });
      }
    }

    // work_history 기준 판단 (사명 변경 alias 적용)
    const primaryKey = nameAliases.get(key) ?? key;
    const whEntries = whByCompany.get(primaryKey) ?? whByCompany.get(key) ?? [];
    const whCount = whEntries.length;
    const whContinuous = whCount === 1; // 하나의 연속 재직기간

    let judgment: string;
    if (workHistory === null) {
      // 경력증명서 미제출
      judgment = "경력증명서 미제출 — work_history 대조 불가";
    } else if (whCount === 0) {
      // 경력증명서에 이 회사의 work_history가 없음 (이력서만 있는 경력)
      judgment = "경력증명서에 해당 회사 근무 이력 없음 (이력서만 있는 경력)";
    } else if (whContinuous && projectGaps.length === 0) {
      judgment = "정규직 가능성 높음: work_history 1건 연속 + 프로젝트 간 단절 없음";
    } else if (whContinuous && projectGaps.length > 0) {
      judgment = "정규직 가능성 높음: work_history 1건 연속 (프로젝트 간 공백은 본사 대기로 추정)";
    } else if (whCount >= 2) {
      judgment = `비정규직 가능성 높음: work_history가 ${whCount}건으로 끊어져 반복 등장 → 고용이 끊어졌다 재개된 패턴`;
    } else {
      judgment = "판단 불가";
    }

    const certOnly = sorted.filter(c => c.source !== "resume_only");
    companyAnalyses.push({
      company_name: sorted[0].company_name,
      career_count: sorted.length,
      cert_career_count: certOnly.length,
      cert_total_days: certOnly.reduce((s, c) => s + c.working_days, 0),
      total_days: sorted.reduce((s, c) => s + c.working_days, 0),
      work_history_entries: whCount,
      work_history_continuous: whContinuous,
      project_gaps: projectGaps,
      judgment,
    });
  }

  // 서로 다른 회사 1건씩 패턴
  const singleProjectCompanies = companyAnalyses.filter(a => a.career_count === 1).map(a => a.company_name);

  return { company_analyses: companyAnalyses, single_project_companies: singleProjectCompanies };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mergeResult, certificateWorkHistory } = body;

    const careers = mergeResult?.merged_careers ?? [];
    const analysis = analyzeCareerPatterns(careers, certificateWorkHistory ?? null);

    const { systemPrompt, userPrompt } = getStep3Prompt();

    // AI 입력에 패턴 분석 결과 추가
    const analysisText = `
[코드 사전 분석 결과 — 반드시 참고하세요]

회사별 분석 (경력증명서 work_history 기준):
${analysis.company_analyses.map(a =>
  `- ${a.company_name}: 경력 ${a.career_count}건, work_history ${a.work_history_entries}건${a.project_gaps.length > 0 ? `, 프로젝트 간 공백 ${a.project_gaps.length}회` : ""}
  → ${a.judgment}`
).join("\n")}

${analysis.company_analyses.filter(a => a.work_history_entries >= 2).length > 0 ? `
⚠ work_history가 끊어져 반복 등장하는 회사 (비정규직 가능성 높음):
${analysis.company_analyses.filter(a => a.work_history_entries >= 2).map(a =>
  `- ${a.company_name}: work_history ${a.work_history_entries}건 → 고용이 ${a.work_history_entries}회 끊어짐`
).join("\n")}
` : ""}
${analysis.single_project_companies.length >= 2 ? `
⚠ 서로 다른 회사에서 각각 1건만 수행 (${analysis.single_project_companies.length}개사):
${analysis.single_project_companies.join(", ")}
` : ""}`;

    const filledUserPrompt = userPrompt
      .replace("{Step 2 출력 JSON}", JSON.stringify(mergeResult, null, 2))
      + "\n" + analysisText;

    // AI는 judgments만 출력 (전체 JSON 재생성 안 함)
    const aiResult = await callGemini(systemPrompt, filledUserPrompt) as {
      judgments?: Array<{ index: number; employment_type: string; employment_type_reason: string }>;
      new_flags?: Array<{ flag_type: string; related_career_index: number | null; description: string }>;
    };

    // AI 판정 결과를 기존 mergeResult에 병합 (mergeResult 데이터는 코드가 보존)
    const employmentResult = JSON.parse(JSON.stringify(mergeResult)); // deep copy
    const judgmentMap = new Map<number, { employment_type: string; employment_type_reason: string }>();
    for (const j of (aiResult.judgments ?? [])) {
      judgmentMap.set(j.index, { employment_type: j.employment_type, employment_type_reason: j.employment_type_reason });
    }
    for (const c of (employmentResult.merged_careers ?? [])) {
      const j = judgmentMap.get(c.index);
      if (j) {
        c.employment_type = j.employment_type;
        c.employment_type_reason = j.employment_type_reason;
      } else {
        c.employment_type = "unknown";
        c.employment_type_reason = "AI 판정 누락";
      }
    }
    // AI가 생성한 새 플래그 추가
    if (aiResult.new_flags && aiResult.new_flags.length > 0) {
      if (!employmentResult.verification_summary) employmentResult.verification_summary = [];
      employmentResult.verification_summary.push(...aiResult.new_flags);
    }

    // --- 코드 강제 적용: AI가 놓칠 수 있는 확실한 패턴 ---
    const resultCareers = employmentResult.merged_careers as Career[];
    if (resultCareers) {
      // 패턴 1: 서로 다른 회사에서 1건씩만 수행 (3개사 이상) → 전부 contract
      if (analysis.single_project_companies.length >= 3) {
        const singleSet = new Set(analysis.single_project_companies.map(n => normalize(n)));
        for (const c of resultCareers) {
          if (singleSet.has(normalize(c.company_name)) ) {
            if ((c as Career & { employment_type: string }).employment_type !== "contract") {
              (c as Career & { employment_type: string; employment_type_reason: string }).employment_type = "contract";
              (c as Career & { employment_type: string; employment_type_reason: string }).employment_type_reason =
                `코드 강제: ${analysis.single_project_companies.length}개 회사에서 각 1건만 수행 — 현장 프로젝트직 패턴`;
            }
          }
        }
      }

      // 패턴 2: 같은 회사 work_history 2건+ 끊김 → 재직기간별 개별 판단
      // 각 WH 기간 내 프로젝트 2건+ & 합산 730일(2년) 초과면 정규직 유지
      for (const ca of analysis.company_analyses) {
        if (ca.work_history_entries >= 2) {
          const compKey = normalize(ca.company_name);
          // WH별 기간 수집
          const whEntries = (certificateWorkHistory ?? [])
            .filter((wh: { company_name: string }) => normalize(wh.company_name) === compKey)
            .map((wh: { period_start: string; period_end: string | null }) => ({
              start: new Date(wh.period_start).getTime(),
              end: wh.period_end ? new Date(wh.period_end).getTime() : Date.now(),
            }));

          for (const c of resultCareers) {
            if (normalize(c.company_name) !== compKey) continue;

            // 이 경력이 속하는 WH 찾기
            const cStart = new Date(c.period_start).getTime();
            const cEnd = new Date(c.period_end).getTime();
            const DAY = 86400000;
            const belongsTo = whEntries.find((wh: { start: number; end: number }) =>
              cStart >= wh.start - DAY && cEnd <= wh.end + DAY
            );

            if (belongsTo) {
              // 같은 WH에 속하는 프로젝트들 수집
              const sameWHProjects = resultCareers.filter(rc =>
                normalize(rc.company_name) === compKey &&
                new Date(rc.period_start).getTime() >= belongsTo.start - DAY &&
                new Date(rc.period_end).getTime() <= belongsTo.end + DAY
              );
              const projectCount = sameWHProjects.length;
              const totalDays = sameWHProjects.reduce((s, p) => s + p.working_days, 0);

              if (projectCount >= 2 && totalDays > 730) {
                // 프로젝트 2건+ & 2년 초과 → 정규직으로 되돌림 (AI가 contract로 판정했어도)
                if ((c as Career & { employment_type: string }).employment_type === "contract") {
                  (c as Career & { employment_type: string; employment_type_reason: string }).employment_type = "regular";
                  (c as Career & { employment_type: string; employment_type_reason: string }).employment_type_reason =
                    `코드 보정: WH 끊김이지만 해당 재직기간 프로젝트 ${projectCount}건 합산 ${totalDays}일(2년 초과) — 정규직 유지`;
                }
                continue;
              }
            }

            // 그 외 → contract 강제
            if ((c as Career & { employment_type: string }).employment_type !== "contract") {
              (c as Career & { employment_type: string; employment_type_reason: string }).employment_type = "contract";
              (c as Career & { employment_type: string; employment_type_reason: string }).employment_type_reason =
                `코드 강제: work_history ${ca.work_history_entries}건 끊어져 반복 — 고용 단절 패턴`;
            }
          }
        }
      }

      // 패턴 3: 다수 프로젝트 + 합산 2년 이내 + 전체 비정규직 성향 → contract
      // 먼저 전체 비정규직 확정 비율 계산
      const totalCareers = resultCareers.length;
      const contractCount = resultCareers.filter(c =>
        (c as Career & { employment_type: string }).employment_type === "contract"
      ).length;
      const contractRatio = totalCareers > 0 ? contractCount / totalCareers : 0;

      if (contractRatio >= 0.4) {
        // 비정규직 성향이 높은 사람 → 다수 프로젝트 + 합산 2년 이내인 회사도 contract
        for (const ca of analysis.company_analyses) {
          // 경력증명서 기준: 프로젝트 2건+ & 합산 2년 이내
          if (ca.cert_career_count >= 2 && ca.cert_total_days <= 730) {
            const compKey = normalize(ca.company_name);
            for (const c of resultCareers) {
              if (normalize(c.company_name) === compKey ) {
                if ((c as Career & { employment_type: string }).employment_type !== "contract") {
                  (c as Career & { employment_type: string; employment_type_reason: string }).employment_type = "contract";
                  (c as Career & { employment_type: string; employment_type_reason: string }).employment_type_reason =
                    `코드 강제: 경력증명서 프로젝트 ${ca.cert_career_count}건 합산 ${ca.cert_total_days}일(2년 이내) + 전체 비정규직 비율 ${Math.round(contractRatio * 100)}%`;
                }
              }
            }
          }
        }
      }

      // 패턴 4: resume_only 경력인데 같은 회사에 경력증명서 경력이 있는 경우
      // + 비정규직 성향이면 → contract 강제 (이력서 기간 기재 오류 or 신고 누락)
      if (contractRatio >= 0.4) {
        const certCompanies = new Set<string>();
        for (const ca of analysis.company_analyses) {
          if (ca.cert_career_count > 0) certCompanies.add(normalize(ca.company_name));
        }
        for (const c of resultCareers) {
          if (c.source === "resume_only" && certCompanies.has(normalize(c.company_name)) ) {
            if ((c as Career & { employment_type: string }).employment_type !== "contract") {
              (c as Career & { employment_type: string; employment_type_reason: string }).employment_type = "contract";
              (c as Career & { employment_type: string; employment_type_reason: string }).employment_type_reason =
                `코드 강제: 이력서만 있는 경력 — 같은 회사 경력증명서 경력 존재 + 전체 비정규직 비율 ${Math.round(contractRatio * 100)}%`;
            }
          }
        }
      }
    }

    // Debug log
    const debugCareers = (employmentResult as { merged_careers?: Array<{ index: number; company_name: string; employment_type: string; employment_type_reason: string }> })?.merged_careers ?? [];
    const debugLog = [
      "=== 코드 사전 분석 ===",
      ...analysis.company_analyses.map(a => `${a.company_name}: wh=${a.work_history_entries}건, gaps=${a.project_gaps.length} → ${a.judgment}`),
      "",
      "=== AI 판정 결과 ===",
      ...debugCareers.map(c => `#${c.index} ${c.company_name}: ${c.employment_type}\n  사유: ${c.employment_type_reason}`),
    ].join("\n");
    console.log("[employment debug]\n" + debugLog);

    return NextResponse.json({ employmentResult });
  } catch (error) {
    console.error("Employment type error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "고용형태 판정 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
