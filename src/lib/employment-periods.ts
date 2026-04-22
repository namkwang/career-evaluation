/**
 * career_details[] + work_history[] → EmploymentPeriod[] 변환 유틸리티
 *
 * 프로젝트(현장) 단위의 flat 데이터를 재직기간 > 프로젝트 2레벨 구조로 변환.
 * 회사유형/고용형태 판정과 편집은 재직기간 단위로 이루어짐.
 */

// --- 타입 정의 ---

export interface WorkHistoryEntry {
  period_start: string;
  period_end: string | null;
  company_name: string;
  company_name_current?: string | null;
}

export interface CareerDetail {
  index: number;
  company_name: string;
  project_name: string | null;
  period_start: string;
  period_end: string;
  working_days: number;
  source: string;
  company_category: string;
  applied_company_category?: string;
  is_small_company: boolean | null;
  ranking_year: number | null;
  ranking_position: number | null;
  company_category_reason: string | null;
  employment_type: string;
  employment_type_reason: string | null;
  base_rate: number;
  contract_adjustment: boolean;
  final_rate: number;
  rate_note: string;
  recognized_days: number;
  continuous_group_id: string | null;
  military_engineer?: boolean | null;
  overlap_excluded?: boolean;
  overlap_days?: number;
}

export interface EPProject {
  index: number;
  project_name: string | null;
  period_start: string;
  period_end: string;
  working_days: number;
  recognized_days: number;
  source: string;
  rate_note?: string;
  overlap_excluded?: boolean;
  overlap_days?: number;
  // 병합된 중복 현장
  merged_children?: Array<{
    project_name: string | null;
    period_start: string;
    period_end: string;
    working_days: number;
  }>;
}

export interface EmploymentPeriod {
  ep_id: string;
  company_name: string;
  period_start: string;
  period_end: string | null;
  source: "certificate" | "resume_only";

  company_category: string;
  is_small_company: boolean | null;
  ranking_year: number | null;
  ranking_position: number | null;
  company_category_reason: string | null;
  employment_type: string;
  employment_type_reason: string | null;
  military_engineer?: boolean | null;
  continuous_group_id: string | null;

  base_rate: number;
  contract_adjustment: boolean;
  final_rate: number;

  total_working_days: number;
  total_recognized_days: number;

  projects: EPProject[];
}

/**
 * EP의 근속일수를 구한다.
 * - 연속근무군(continuous_group_id)에 속하면 그룹 내 모든 EP의 total_working_days 합
 * - 그렇지 않으면 해당 EP의 total_working_days
 *
 * Step 3의 general_outside100 "근속 2년" 판정에 사용된다.
 */
export function getTenureDays(ep: EmploymentPeriod, allPeriods: EmploymentPeriod[]): number {
  if (!ep.continuous_group_id) return ep.total_working_days;
  return allPeriods
    .filter(p => p.continuous_group_id === ep.continuous_group_id)
    .reduce((s, p) => s + p.total_working_days, 0);
}

// --- 유틸 함수 ---

function normName(s: string): string {
  return s.replace(/\(주\)|㈜|주식회사|\s/g, "");
}

function dateOverlaps(
  aStart: string, aEnd: string | null,
  bStart: string, bEnd: string,
): boolean {
  const as = new Date(aStart).getTime();
  const ae = aEnd ? new Date(aEnd).getTime() : Date.now();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as <= be && ae >= bs;
}

// --- 메인 빌더 ---

export function buildEmploymentPeriods(
  careerDetails: CareerDetail[],
  workHistory: WorkHistoryEntry[] | null | undefined,
): EmploymentPeriod[] {
  if (!careerDetails || careerDetails.length === 0) return [];

  // 시작일 빠른 순 정렬 (work_history)
  const sortedWH = workHistory
    ? [...workHistory].sort((a, b) => (a.period_start ?? "").localeCompare(b.period_start ?? ""))
    : null;

  // career_details → 매칭 추적
  const matched = new Set<number>(); // career index
  const periods: EmploymentPeriod[] = [];

  if (sortedWH && sortedWH.length > 0) {
    // --- work_history 기반 빌드 ---
    for (const wh of sortedWH) {
      // 회사명 매칭: 당시 회사명 + 현재 회사명 모두로 매칭 시도
      // 단, 기간(dateOverlaps)으로 엄격히 구분하여 다른 WH의 프로젝트를 가져가지 않음
      const whKeys = [normName(wh.company_name)];
      if (wh.company_name_current) whKeys.push(normName(wh.company_name_current));

      // 이 work_history에 해당하는 프로젝트 찾기
      const matchedProjects: CareerDetail[] = [];
      for (const cd of careerDetails) {
        if (matched.has(cd.index)) continue;
        const cdKey = normName(cd.company_name);
        if (!whKeys.includes(cdKey)) continue;
        if (!dateOverlaps(wh.period_start, wh.period_end, cd.period_start, cd.period_end)) continue;
        matchedProjects.push(cd);
        matched.add(cd.index);
      }

      if (matchedProjects.length === 0) continue;

      // 최신→과거 정렬
      matchedProjects.sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));

      // 기간 중복 병합 (overlap_excluded → 부모에 흡수)
      const { visibleProjects } = mergeOverlapProjects(matchedProjects);

      // 첫 프로젝트에서 회사 정보 가져오기 (코드가 이미 회사 단위로 통일)
      const rep = matchedProjects.find(p => !p.overlap_excluded) ?? matchedProjects[0];

      const groupId = matchedProjects.find(p => p.continuous_group_id)?.continuous_group_id ?? null;

      const epId = `ep_${normName(wh.company_name)}_${wh.period_start}`;
      periods.push({
        ep_id: epId,
        company_name: rep.company_name,
        period_start: wh.period_start,
        period_end: wh.period_end,
        source: "certificate",
        company_category: rep.applied_company_category ?? rep.company_category,
        is_small_company: rep.is_small_company,
        ranking_year: rep.ranking_year,
        ranking_position: rep.ranking_position,
        company_category_reason: rep.company_category_reason,
        employment_type: rep.employment_type,
        employment_type_reason: rep.employment_type_reason,
        military_engineer: rep.military_engineer,
        continuous_group_id: groupId,
        base_rate: rep.base_rate,
        contract_adjustment: rep.contract_adjustment,
        final_rate: rep.final_rate,
        total_working_days: matchedProjects.reduce((s, p) => s + p.working_days, 0),
        total_recognized_days: matchedProjects.reduce((s, p) => s + p.recognized_days, 0),
        projects: visibleProjects,
      });
    }
  }

  // --- 매칭 안 된 career_details (이력서 경력 또는 work_history 없는 경우) ---
  const unmatched = careerDetails.filter(cd => !matched.has(cd.index));
  if (unmatched.length > 0) {
    // 회사별로 그룹핑
    const byCompany = new Map<string, CareerDetail[]>();
    for (const cd of unmatched) {
      const key = normName(cd.company_name);
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(cd);
    }

    for (const [, group] of byCompany) {
      group.sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));

      const { visibleProjects } = mergeOverlapProjects(group);

      const rep = group.find(p => !p.overlap_excluded) ?? group[0];
      const starts = group.map(g => g.period_start).sort();
      const ends = group.map(g => g.period_end).sort();

      const groupId = group.find(p => p.continuous_group_id)?.continuous_group_id ?? null;

      const epId = `ep_${normName(rep.company_name)}_${starts[0]}`;
      periods.push({
        ep_id: epId,
        company_name: rep.company_name,
        period_start: starts[0],
        period_end: ends[ends.length - 1],
        source: "resume_only",
        company_category: rep.applied_company_category ?? rep.company_category,
        is_small_company: rep.is_small_company,
        ranking_year: rep.ranking_year,
        ranking_position: rep.ranking_position,
        company_category_reason: rep.company_category_reason,
        employment_type: rep.employment_type,
        employment_type_reason: rep.employment_type_reason,
        military_engineer: rep.military_engineer,
        continuous_group_id: groupId,
        base_rate: rep.base_rate,
        contract_adjustment: rep.contract_adjustment,
        final_rate: rep.final_rate,
        total_working_days: group.reduce((s, p) => s + p.working_days, 0),
        total_recognized_days: group.reduce((s, p) => s + p.recognized_days, 0),
        projects: visibleProjects,
      });
    }
  }

  // 최신→과거 정렬 (재직기간 시작일 기준)
  periods.sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));

  return periods;
}

// --- 기간 중복 프로젝트 병합 ---
// overlap_excluded 프로젝트를 부모 프로젝트에 흡수하여 표시 행 수를 줄임

function mergeOverlapProjects(
  projects: CareerDetail[],
): { visibleProjects: EPProject[] } {
  // non-excluded 프로젝트 목록
  const nonExcluded = projects.filter(p => !p.overlap_excluded);
  const excluded = projects.filter(p => p.overlap_excluded);

  // excluded → 부모 매칭 (기간 겹침이 가장 큰 non-excluded)
  const childrenMap = new Map<number, Array<{ project_name: string | null; period_start: string; period_end: string; working_days: number }>>();

  for (const ex of excluded) {
    const exStart = new Date(ex.period_start).getTime();
    const exEnd = new Date(ex.period_end).getTime();

    let bestIdx = -1;
    let bestOverlap = 0;
    for (const ne of nonExcluded) {
      const neStart = new Date(ne.period_start).getTime();
      const neEnd = new Date(ne.period_end).getTime();
      const os = Math.max(exStart, neStart);
      const oe = Math.min(exEnd, neEnd);
      if (os <= oe) {
        const overlap = oe - os;
        if (overlap > bestOverlap) { bestOverlap = overlap; bestIdx = ne.index; }
      }
    }

    if (bestIdx >= 0) {
      if (!childrenMap.has(bestIdx)) childrenMap.set(bestIdx, []);
      childrenMap.get(bestIdx)!.push({
        project_name: ex.project_name,
        period_start: ex.period_start,
        period_end: ex.period_end,
        working_days: ex.working_days,
      });
    } else {
      // 부모 없는 excluded → 그냥 표시 (0일 인정)
      nonExcluded.push(ex);
    }
  }

  // visibleProjects 빌드
  // 최신→과거 정렬 유지
  const sorted = [...nonExcluded].sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));

  const visibleProjects: EPProject[] = sorted.map(p => ({
    index: p.index,
    project_name: p.project_name,
    period_start: p.period_start,
    period_end: p.period_end,
    working_days: p.working_days,
    recognized_days: p.recognized_days,
    source: p.source,
    rate_note: p.rate_note,
    overlap_excluded: p.overlap_excluded,
    overlap_days: p.overlap_days,
    merged_children: childrenMap.get(p.index),
  }));

  return { visibleProjects };
}
