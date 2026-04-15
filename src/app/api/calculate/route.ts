import { NextRequest, NextResponse } from "next/server";

// --- 인정률 테이블 ---
function getBaseRate(category: string, isSmall: boolean | null, militaryEngineer: boolean | null): number {
  if (category === "military") return militaryEngineer ? 20 : 0;
  if (category === "other") return 0;
  if (isSmall) return 64;
  switch (category) {
    case "general_top100": return 100;
    case "general_outside100": return 80;
    case "specialty": return 80;
    case "construction_related": return 64;
    default: return 0;
  }
}

function calcFinalRate(
  baseRate: number,
  employmentType: string,
  category: string,
  hiringType: string,
): { finalRate: number; contractAdj: boolean; note: string } {
  if (employmentType === "contract") {
    if ((hiringType === "전문직" || hiringType === "현채직" || hiringType === "professional" || hiringType === "site_hire") && category === "general_top100") {
      return { finalRate: baseRate, contractAdj: false, note: "전문직/현채직 채용 예외 - 계약직 보정 미적용" };
    }
    const adjusted = Math.round(baseRate * 0.8 * 10) / 10;
    return { finalRate: adjusted, contractAdj: true, note: "계약직 보정 ×0.8" };
  }
  if (employmentType === "unknown") {
    return { finalRate: baseRate, contractAdj: false, note: "고용형태 미확인 - 계약직 보정 미적용" };
  }
  return { finalRate: baseRate, contractAdj: false, note: "정규직" };
}

// --- 학력 차감 ---
interface Education {
  degree?: string | null;
  school_name?: string | null;
  department?: string | null;
}

function calcEducationDeduction(education: Education[]): {
  education_level: string;
  education_deduction_years: number;
  education_note: string;
} {
  if (!education || education.length === 0) {
    return { education_level: "학력 정보 없음", education_deduction_years: 4, education_note: "학력 정보 없음 — 고졸 이하로 간주 (4년 차감)" };
  }

  let bestDegree = "고졸";
  let bestScore = 0;
  let bestNote = "";

  for (const edu of education) {
    const raw = edu.degree ?? "";
    let normalized = "";
    let score = 0;

    if (/박사/.test(raw)) { normalized = "박사"; score = 5; }
    else if (/석사/.test(raw)) { normalized = "석사"; score = 4; }
    else if (/학사|4년제/.test(raw) && !/중퇴|전문/.test(raw)) { normalized = "학사"; score = 3; }
    else if (/3년제|전문학사.*3년/.test(raw)) { normalized = "3년제 전문학사"; score = 2; }
    else if (/전문학사|2년제|전문대/.test(raw)) { normalized = "전문학사"; score = 1; }
    else if (/고졸|고등학교/.test(raw)) { normalized = "고졸"; score = 0; }

    if (score > bestScore) {
      bestScore = score;
      bestDegree = normalized;
      bestNote = `${edu.school_name ?? ""} ${edu.department ?? ""} (${raw})`.trim();
    }
  }

  // 차감 연수 결정
  const deductionMap: Record<string, number> = {
    "박사": 0,
    "석사": 0,
    "학사": 0,
    "3년제 전문학사": 1,
    "전문학사": 2,
    "고졸": 4,
  };

  const deduction = deductionMap[bestDegree] ?? 4;
  const levelLabel = bestDegree || "고졸 이하";

  return {
    education_level: levelLabel,
    education_deduction_years: deduction,
    education_note: bestNote || levelLabel,
  };
}

// --- 회사명 정규화 ---
const normName = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Career = Record<string, any>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mergeResult, hiring_type } = body;

    const inputCareers: Career[] = mergeResult?.merged_careers ?? [];
    const education: Education[] = mergeResult?.education ?? [];
    const hiringType = hiring_type ?? "일반";

    // --- 1. merged_careers → career_details 변환 (1:1 대응) ---
    const careerDetails: Career[] = inputCareers.map((c) => {
      const cat = c.applied_company_category ?? c.company_category ?? "other";
      const emp = c.employment_type ?? "unknown";
      const small = c.is_small_company ?? null;
      const milEng = c.military_engineer ?? null;

      const baseRate = getBaseRate(cat, small, milEng);
      const { finalRate, contractAdj, note } = calcFinalRate(baseRate, emp, cat, hiringType);

      return {
        index: c.index,
        company_name: c.company_name,
        project_name: c.project_name ?? null,
        period_start: c.period_start,
        period_end: c.period_end,
        working_days: c.working_days,
        source: c.source ?? "certificate",

        company_category: c.company_category,
        is_small_company: small,
        ranking_year: c.ranking_year ?? null,
        ranking_position: c.ranking_position ?? null,
        company_category_reason: c.company_category_reason ?? null,
        employment_type: emp,
        employment_type_reason: c.employment_type_reason ?? null,

        continuous_group_id: null,
        applied_company_category: cat,
        military_engineer: milEng,

        base_rate: baseRate,
        contract_adjustment: contractAdj,
        contract_exception: false,
        final_rate: finalRate,
        rate_note: note,
        recognized_days: Math.floor(c.working_days * finalRate / 100),
      };
    });

    // --- 2. 기간 중복 감지 + 보정 ---
    const sortedForOverlap = [...careerDetails].sort(
      (a, b) => (a.period_start ?? "").localeCompare(b.period_start ?? "")
    );
    const coveredByCompany = new Map<string, Array<[number, number]>>();

    for (const career of sortedForOverlap) {
      const key = normName(career.company_name);
      if (!coveredByCompany.has(key)) coveredByCompany.set(key, []);
      const covered = coveredByCompany.get(key)!;

      const start = new Date(career.period_start).getTime();
      const end = new Date(career.period_end).getTime();

      let overlapDays = 0;
      for (const [cs, ce] of covered) {
        const overlapStart = Math.max(start, cs);
        const overlapEnd = Math.min(end, ce);
        if (overlapStart <= overlapEnd) {
          overlapDays += Math.round((overlapEnd - overlapStart) / 86400000) + 1;
        }
      }

      if (overlapDays > 0 && overlapDays >= career.working_days) {
        career.recognized_days = 0;
        career.final_rate = 0;
        career.overlap_excluded = true;
        career.rate_note = (career.rate_note ?? "") + " [기간 중복 제외]";
      } else if (overlapDays > 0) {
        const effectiveDays = career.working_days - overlapDays;
        career.recognized_days = Math.floor(effectiveDays * career.final_rate / 100);
        career.overlap_days = overlapDays;
        career.rate_note = (career.rate_note ?? "") + ` [기간 중복 ${overlapDays}일 차감]`;
      }

      covered.push([start, end]);
    }

    // --- 3. 3개월(90일) 미만 경력 제외 (회사 재직기간 합산 기준) ---
    // 같은 회사의 전체 근무일수 합산
    const companyTotalDays = new Map<string, number>();
    for (const career of careerDetails) {
      const key = normName(career.company_name);
      companyTotalDays.set(key, (companyTotalDays.get(key) ?? 0) + career.working_days);
    }
    for (const career of careerDetails) {
      const key = normName(career.company_name);
      const totalDays = companyTotalDays.get(key) ?? 0;
      if (totalDays < 90) {
        career.recognized_days = 0;
        career.final_rate = 0;
        career.rate_note = (career.rate_note ?? "") + " [3개월 미만 경력 제외]";
      }
    }


    // --- 4. 합계 계산 ---
    const totalWorkingDays = careerDetails.reduce((sum, c) => sum + (c.working_days ?? 0), 0);
    const totalRecognized = careerDetails.reduce((sum, c) => sum + (c.recognized_days ?? 0), 0);
    const totalRecognizedYears = Math.round((totalRecognized / 365) * 10) / 10;

    // --- 5. 학력 차감 ---
    const eduResult = calcEducationDeduction(education);
    const finalCareerYears = Math.max(0, Math.round((totalRecognizedYears - eduResult.education_deduction_years) * 10) / 10);
    const careerYearLevel = Math.floor(finalCareerYears);

    // --- 6. 인정률별 요약 ---
    const rateGroups: Record<string, { days: number; companies: string[] }> = {};
    for (const c of careerDetails) {
      if (c.recognized_days <= 0) continue;
      const rateKey = `rate_${String(c.final_rate).replace(".", "_")}`;
      if (!rateGroups[rateKey]) rateGroups[rateKey] = { days: 0, companies: [] };
      rateGroups[rateKey].days += c.recognized_days;
      const name = c.company_name;
      if (!rateGroups[rateKey].companies.includes(name)) rateGroups[rateKey].companies.push(name);
    }
    // 0% 그룹 (제외된 경력)
    const zeroDays = careerDetails.filter(c => c.recognized_days === 0).reduce((s, c) => s + c.working_days, 0);
    if (zeroDays > 0) {
      rateGroups["rate_0"] = { days: zeroDays, companies: ["제외 경력"] };
    }

    const rateBreakdown: Record<string, { days: number; description: string }> = {};
    for (const [key, val] of Object.entries(rateGroups)) {
      rateBreakdown[key] = {
        days: val.days,
        description: val.companies.join(", "),
      };
    }

    // --- 결과 조립 ---
    const result = {
      applicant_name: mergeResult?.applicant_name ?? mergeResult?.personal_info?.name_korean ?? "",
      applied_field: mergeResult?.applied_field ?? body.applied_field ?? "",
      hiring_type: hiringType,

      career_details: careerDetails,

      calculation_summary: {
        total_working_days: totalWorkingDays,
        total_recognized_days: totalRecognized,
        total_recognized_years: totalRecognizedYears,
        education_level: eduResult.education_level,
        education_deduction_years: eduResult.education_deduction_years,
        education_note: eduResult.education_note,
        final_career_years: finalCareerYears,
        career_year_level: careerYearLevel,
      },

      rate_breakdown: rateBreakdown,
      remaining_flags: mergeResult?.verification_summary ?? [],
    };

    return NextResponse.json({ calculateResult: result });
  } catch (error) {
    console.error("Calculate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "경력산정 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
