"use client";

import { Fragment, useState, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { BadgeSelect, CATEGORY_OPTIONS, EMPLOYMENT_OPTIONS } from "@/components/badge-select";
import {
  buildEmploymentPeriods,
  type WorkHistoryEntry,
  type EmploymentPeriod,
  type CareerDetail,
} from "@/lib/employment-periods";

// --- 인정률 계산 ---

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

// --- 타입 ---

interface PeriodEdit {
  employment_type?: string;
  company_category?: string;
  is_small_company?: boolean;
  manual_final_rate?: number;
}

interface FinalResultProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalData?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employmentData: any;
  hiringType?: string;
  educationDeductionYears?: number;
  onDataUpdate?: (newData: unknown) => void;
  workHistory?: WorkHistoryEntry[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mergeResult?: any;
  savedId?: string | null;
}

function formatYearsMonths(years: number): string {
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (m === 0) return `${y}년`;
  return `${y}년 ${m}개월`;
}

function formatDaysAsYM(days: number): string {
  const years = days / 365;
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (y === 0 && m === 0) return "0개월";
  if (y === 0) return `${m}개월`;
  if (m === 0) return `${y}년`;
  return `${y}년 ${m}개월`;
}

const EP_COLOR = { border: "border-l-foreground/20", bg: "bg-muted/40", dot: "bg-foreground/60" };

// --- 메인 컴포넌트 ---

export function FinalResult({ data, originalData, employmentData, hiringType, onDataUpdate, workHistory, mergeResult, savedId }: FinalResultProps) {
  const summary = data?.calculation_summary;
  const breakdown = data?.rate_breakdown;
  const flags = data?.remaining_flags ?? [];

  // Employment Periods 빌드
  const periods = useMemo(() => {
    const careerDetails = data?.career_details as CareerDetail[] ?? [];
    return buildEmploymentPeriods(careerDetails, workHistory);
  }, [data, workHistory]);

  // 원본 EP (비교용)
  const originalPeriods = useMemo(() => {
    if (!originalData) return null;
    const careerDetails = originalData?.career_details as CareerDetail[] ?? [];
    return buildEmploymentPeriods(careerDetails, workHistory);
  }, [originalData, workHistory]);

  // 편집 상태: ep_id → 수정값
  const [edits, setEdits] = useState<Map<string, PeriodEdit>>(new Map());
  const [appliedEdits, setAppliedEdits] = useState<Map<string, PeriodEdit>>(new Map());

  // 로드 시 originalData ↔ data 비교하여 appliedEdits 복원
  const [editsRestored, setEditsRestored] = useState(false);

  // 다른 지원자 로드 시 (originalData 교체) 복원 플래그/적용 편집 초기화
  useEffect(() => {
    setEditsRestored(false);
    setAppliedEdits(new Map());
  }, [originalData]);

  useEffect(() => {
    if (editsRestored) return;
    if (!originalPeriods || !periods || periods.length === 0) return;
    if (originalData === data) return; // 수정 없음

    const restored = new Map<string, PeriodEdit>();
    for (const ep of periods) {
      const origEP = originalPeriods.find((o: EmploymentPeriod) => o.ep_id === ep.ep_id);
      if (!origEP) continue;
      const diff: PeriodEdit = {};
      if (ep.company_category !== origEP.company_category) diff.company_category = ep.company_category;
      if (ep.employment_type !== origEP.employment_type) diff.employment_type = ep.employment_type;
      if (Object.keys(diff).length > 0) restored.set(ep.ep_id, diff);
    }
    if (restored.size > 0) setAppliedEdits(restored);
    setEditsRestored(true);
  }, [originalPeriods, periods, originalData, data, editsRestored]);

  const hasEdits = edits.size > 0;
  const isRecalculated = originalData && originalData !== data;
  const originalSummary = originalData?.calculation_summary;

  const updateEdit = useCallback((epId: string, field: keyof PeriodEdit, value: string | boolean | number) => {
    setEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(epId) ?? {};

      // 현재 적용된 값과 동일하면 수정 불필요
      const appliedEdit = appliedEdits.get(epId);
      const currentApplied = appliedEdit?.[field];
      // 현재 EP에서 실제 표시 중인 값
      const currentEP = periods.find((ep: EmploymentPeriod) => ep.ep_id === epId);
      let displayedValue: string | boolean | number | undefined;
      if (field === "company_category") displayedValue = currentApplied ?? currentEP?.company_category;
      else if (field === "employment_type") displayedValue = currentApplied ?? currentEP?.employment_type;
      else if (field === "is_small_company") displayedValue = currentApplied ?? currentEP?.is_small_company ?? undefined;
      else if (field === "manual_final_rate") displayedValue = currentApplied;

      if (field === "manual_final_rate") {
        // 수기 입력은 항상 edits에 저장 (비교 없이)
        next.set(epId, { ...existing, [field]: value as number });
        return next;
      }
      if (value === displayedValue) {
        // 현재 표시값과 같으면 변경 없음
        delete existing[field];
        if (Object.keys(existing).length === 0) next.delete(epId);
        else next.set(epId, existing);
      } else {
        next.set(epId, { ...existing, [field]: value });
      }
      return next;
    });
  }, [appliedEdits, periods]);

  const getEditedValue = useCallback((epId: string, field: keyof PeriodEdit, original: string | boolean | null) => {
    const edit = edits.get(epId);
    if (edit && field in edit) return edit[field];
    const applied = appliedEdits.get(epId);
    if (applied && field in applied) return applied[field];
    return original;
  }, [edits, appliedEdits]);

  const isEdited = useCallback((epId: string, field: keyof PeriodEdit) => {
    return (edits.has(epId) && field in (edits.get(epId) ?? {}))
      || (appliedEdits.has(epId) && field in (appliedEdits.get(epId) ?? {}));
  }, [edits, appliedEdits]);

  // --- 재계산 (EP 단위) ---
  const handleRecalculate = useCallback(() => {
    if (!data?.career_details) return;
    const ht = hiringType ?? data?.hiring_type ?? "일반";
    const eduDeduction = data?.calculation_summary?.education_deduction_years ?? 0;

    // 모든 edits 병합
    const allEdits = new Map(appliedEdits);
    for (const [k, v] of edits) allEdits.set(k, v);

    // EP별로 편집값 적용하여 career_details 재계산
    const normName = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");
    const newDetails = (data.career_details as CareerDetail[]).map((d) => {
      // 이 career가 속하는 EP 찾기
      const matchedEP = periods.find(ep => {
        const epKey = normName(ep.company_name);
        const dKey = normName(d.company_name);
        return epKey === dKey && ep.projects.some(p => p.index === d.index);
      });

      const epEdit = matchedEP ? allEdits.get(matchedEP.ep_id) : undefined;
      const cat = (epEdit?.company_category as string) ?? d.applied_company_category ?? d.company_category;
      const isManual = cat === "manual";
      const emp = isManual ? "manual" : ((epEdit?.employment_type as string) ?? d.employment_type);
      const small = epEdit?.is_small_company !== undefined ? epEdit.is_small_company as boolean : d.is_small_company;

      let baseRate: number;
      let finalRate: number;
      let contractAdj: boolean;
      let rateNote: string;

      if (isManual) {
        const manualRate = epEdit?.manual_final_rate ?? 100;
        baseRate = manualRate;
        contractAdj = false;
        finalRate = manualRate;
        rateNote = `수기 입력 (${manualRate}%)`;
      } else {
        baseRate = getBaseRate(cat, small, d.military_engineer ?? null);
        const calc = calcFinalRate(baseRate, emp, cat, ht);
        finalRate = calc.finalRate;
        contractAdj = calc.contractAdj;
        rateNote = calc.note;
      }

      const recognizedDays = Math.floor(d.working_days * finalRate / 100);

      return {
        ...d,
        working_days: d.working_days,
        applied_company_category: cat,
        employment_type: emp,
        is_small_company: small,
        base_rate: baseRate,
        contract_adjustment: contractAdj,
        final_rate: finalRate,
        rate_note: rateNote,
        recognized_days: recognizedDays,
        overlap_excluded: false,
        overlap_days: 0,
      };
    });

    // 기간 중복 처리
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sortedForOverlap = [...newDetails].sort((a: any, b: any) => (a.period_start ?? "").localeCompare(b.period_start ?? ""));
    const coveredByCompany = new Map<string, Array<[number, number]>>();

    for (const career of sortedForOverlap) {
      const key = normName(career.company_name);
      if (!coveredByCompany.has(key)) coveredByCompany.set(key, []);
      const covered = coveredByCompany.get(key)!;
      const start = new Date(career.period_start).getTime();
      const end = new Date(career.period_end).getTime();

      let overlapDays = 0;
      for (const [cs, ce] of covered) {
        const os = Math.max(start, cs);
        const oe = Math.min(end, ce);
        if (os <= oe) overlapDays += Math.round((oe - os) / 86400000) + 1;
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

    // 3개월 미만 제외 (회사 재직기간 합산 기준)
    const normN = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");
    const companyTotal = new Map<string, number>();
    for (const c of newDetails) {
      const key = normN(c.company_name);
      companyTotal.set(key, (companyTotal.get(key) ?? 0) + c.working_days);
    }
    for (const c of newDetails) {
      const key = normN(c.company_name);
      if ((companyTotal.get(key) ?? 0) < 90) {
        c.recognized_days = 0;
        c.final_rate = 0;
        c.rate_note = (c.rate_note ?? "") + " [3개월 미만 경력 제외]";
      }
    }

    const totalWorkingDays = newDetails.reduce((s: number, c: { working_days: number }) => s + c.working_days, 0);
    const totalRecognized = newDetails.reduce((s: number, c: { recognized_days: number }) => s + c.recognized_days, 0);
    const totalYears = Math.round((totalRecognized / 365) * 10) / 10;
    const finalYears = Math.max(0, Math.round((totalYears - eduDeduction) * 10) / 10);

    // 인정률별 요약 재계산
    const rateGroups: Record<string, { days: number; companies: string[] }> = {};
    for (const c of newDetails) {
      if (c.recognized_days <= 0) continue;
      const rateKey = `rate_${String(c.final_rate).replace(".", "_")}`;
      if (!rateGroups[rateKey]) rateGroups[rateKey] = { days: 0, companies: [] };
      rateGroups[rateKey].days += c.recognized_days;
      if (!rateGroups[rateKey].companies.includes(c.company_name)) rateGroups[rateKey].companies.push(c.company_name);
    }
    const zeroDays = newDetails.filter(c => c.recognized_days === 0).reduce((s: number, c: { working_days: number }) => s + c.working_days, 0);
    if (zeroDays > 0) {
      rateGroups["rate_0"] = { days: zeroDays, companies: ["제외 경력"] };
    }
    const newBreakdown: Record<string, { days: number; description: string }> = {};
    for (const [key, val] of Object.entries(rateGroups)) {
      newBreakdown[key] = { days: val.days, description: val.companies.join(", ") };
    }

    const newData = {
      ...data,
      career_details: newDetails,
      rate_breakdown: newBreakdown,
      calculation_summary: {
        ...data.calculation_summary,
        total_working_days: totalWorkingDays,
        total_recognized_days: totalRecognized,
        total_recognized_years: totalYears,
        final_career_years: finalYears,
        career_year_level: Math.floor(finalYears),
      },
    };

    setAppliedEdits(allEdits);
    setEdits(new Map());
    onDataUpdate?.(newData);
  }, [data, edits, appliedEdits, hiringType, onDataUpdate, periods]);

  return (
    <div className="space-y-6">
      {/* 최상단: 지원자 정보 + 경력연차 요약 */}
      {summary && (() => {
        const pi = mergeResult?.personal_info;
        const edu = mergeResult?.education as Array<{ school_name?: string; department?: string; degree?: string }> ?? [];
        const certs = mergeResult?.certifications as Array<{ type_and_grade?: string }> ?? [];
        const birthYear = pi?.birth_year ?? (pi?.birth_date ? parseInt(pi.birth_date.substring(0, 4)) : null);
        const age = birthYear ? new Date().getFullYear() - birthYear + 1 : null;

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 좌측: 지원자 정보 */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-2xl font-display">
                        {pi?.name_korean ?? mergeResult?.applicant_name ?? data?.applicant_name ?? "-"}
                        {age && <span className="text-base font-normal text-muted-foreground ml-2">({age}세)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {mergeResult?.applied_field ?? data?.applied_field ?? ""} / {hiringType ?? ""} 채용
                      </p>
                    </div>
                    {savedId && (
                      <div className="flex gap-2">
                        <button onClick={() => window.open(`/api/history/${savedId}/file/resume`, '_blank', 'width=900,height=1200,scrollbars=yes')} title="이력서 원본" className="flex flex-col items-center gap-1 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                          <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>
                          <span className="text-[10px] text-muted-foreground">이력서</span>
                        </button>
                        <button onClick={() => window.open(`/api/history/${savedId}/file/certificate`, '_blank', 'width=900,height=1200,scrollbars=yes')} title="경력증명서 원본" className="flex flex-col items-center gap-1 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                          <svg className="w-6 h-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>
                          <span className="text-[10px] text-muted-foreground">경력증명서</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-14 shrink-0">학력</span>
                      <span className="font-medium">
                        {(() => {
                          if (edu.length === 0) return summary.education_level ?? "-";
                          const order: Record<string, number> = { "박사": 5, "석사": 4, "학사": 3, "3년제 전문학사": 2, "전문학사": 1, "고졸": 0 };
                          const scored = edu.map(e => ({
                            ...e,
                            score: Object.entries(order).find(([k]) => (e.degree ?? "").includes(k))?.[1] ?? -1,
                          }));
                          // 고졸 이하 제외, 높은 순 정렬. 단 최종학력이 고졸이면 고졸 포함
                          const maxScore = Math.max(...scored.map(e => e.score));
                          const filtered = scored.filter(e => maxScore <= 0 ? e.score >= 0 : e.score > 0).sort((a, b) => b.score - a.score);
                          if (filtered.length === 0) return summary.education_level ?? "-";
                          return filtered.map((e, i) => <span key={i}>{i > 0 && ", "}{e.degree ?? ""} ({e.school_name ?? ""}{e.department ? ` ${e.department}` : ""})</span>);
                        })()}
                      </span>
                    </div>
                    {certs.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground w-14 shrink-0">자격증</span>
                        <span className="font-medium">{certs.map(c => c.type_and_grade).join(", ")}</span>
                      </div>
                    )}
                    {pi?.phone && (
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground w-14 shrink-0">연락처</span>
                        <span className="font-medium">{pi.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 우측: 경력연차 요약 */}
            <Card className="shadow-md">
              <CardContent className="pt-6">
                <div className="text-center mb-4">
                  <p className="text-sm text-muted-foreground mb-1">최종 경력연차</p>
                  <p className="text-5xl font-display text-primary tracking-tight">
                    {formatYearsMonths(summary.final_career_years)}
                  </p>
                  {isRecalculated && originalSummary && originalSummary.final_career_years !== summary.final_career_years && (
                    <p className="text-sm mt-2 text-warning-muted-foreground font-medium">
                      AI 산정: {formatYearsMonths(originalSummary.final_career_years)} → 수정 후: {formatYearsMonths(summary.final_career_years)}
                    </p>
                  )}
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">총 근무일수</p>
                    <p className="text-lg font-semibold">{summary.total_working_days?.toLocaleString()}일</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">총 인정일수</p>
                    <p className="text-lg font-semibold">{summary.total_recognized_days?.toLocaleString()}일</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">인정연수</p>
                    <p className="text-lg font-semibold">{formatYearsMonths(summary.total_recognized_years)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">학력 차감</p>
                    <p className="text-lg font-semibold">-{summary.education_deduction_years}년</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* 인정률별 요약 */}
      {breakdown && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">인정률별 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: "rate_100", label: "100%", color: "bg-blue-50 border-blue-200" },
                { key: "rate_80", label: "80%", color: "bg-sky-50 border-sky-200" },
                { key: "rate_64", label: "64%", color: "bg-green-50 border-green-200" },
                { key: "rate_51_2", label: "51.2%", color: "bg-yellow-50 border-yellow-200" },
                { key: "rate_20", label: "20%", color: "bg-orange-50 border-orange-200" },
                { key: "rate_0", label: "0%", color: "bg-gray-50 border-gray-200" },
              ].map(({ key, label, color }) => {
                const item = breakdown[key];
                if (!item || item.days === 0) return null;
                return (
                  <div key={key} className={`rounded-lg border p-3 ${color}`}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-sm font-bold">{item.days?.toLocaleString()}일</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 경력 상세 (재직기간 > 프로젝트 2레벨) */}
      {periods.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">경력 상세 ({periods.length}개 재직기간)</CardTitle>
              {hasEdits && (
                <Button onClick={handleRecalculate} size="sm">재계산</Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>회사 / 현장</TableHead>
                    <TableHead>기간</TableHead>
                    <TableHead className="text-right">근무일수</TableHead>
                    <TableHead>회사유형</TableHead>
                    <TableHead>고용형태</TableHead>
                    <TableHead className="text-right">기본률</TableHead>
                    <TableHead className="text-center">계약조정</TableHead>
                    <TableHead className="text-right">최종률</TableHead>
                    <TableHead className="text-right">인정일수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((ep, epIdx) => {
                    const color = EP_COLOR;
                    const catEdited = isEdited(ep.ep_id, "company_category");
                    const empEdited = isEdited(ep.ep_id, "employment_type");
                    const currentCat = getEditedValue(ep.ep_id, "company_category", ep.company_category) as string;
                    const currentEmp = getEditedValue(ep.ep_id, "employment_type", ep.employment_type) as string;

                    // 수기 입력 모드 여부
                    const isManual = currentCat === "manual";
                    const manualFinalRate = (getEditedValue(ep.ep_id, "manual_final_rate", null) as number | null) ?? 100;

                    // 재직기간 행의 인정률 (편집값 반영)
                    const epBaseRate = isManual ? manualFinalRate : getBaseRate(currentCat, ep.is_small_company, ep.military_engineer ?? null);
                    const epCalc = isManual
                      ? { finalRate: manualFinalRate, contractAdj: false, note: "수기 입력" }
                      : calcFinalRate(epBaseRate, currentEmp, currentCat, hiringType ?? "일반");

                    // 재직기간 간 공백/연속 표시
                    let gapLabel: React.ReactNode = null;
                    if (epIdx < periods.length - 1) {
                      const nextEP = periods[epIdx + 1];
                      const currStart = new Date(ep.period_start);
                      const prevEnd = new Date(nextEP.period_end ?? nextEP.period_start);
                      const gapDays = Math.round((currStart.getTime() - prevEnd.getTime()) / 86400000) - 1;
                      if (gapDays <= 1) {
                        gapLabel = <span className="text-success-muted-foreground" title="기간 연속">↑ 연속</span>;
                      } else {
                        gapLabel = <span className="text-destructive-muted-foreground" title={`${gapDays}일 공백`}>↑ {gapDays}일 공백</span>;
                      }
                    }

                    return (
                      <Fragment key={ep.ep_id}>
                        {/* 재직기간 행 (편집 가능) */}
                        <TableRow className={`${color.bg} border-b-0 hover:${color.bg}`}>
                          <TableCell className={`border-l-4 ${color.border} font-semibold text-xs`}>
                            <span className={`inline-block w-2 h-2 rounded-full ${color.dot}`} />
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="font-semibold">{ep.company_name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({ep.source === "certificate" ? "경력증명서" : "이력서"})
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              프로젝트 {ep.projects.length}건
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs font-medium">
                            {ep.period_start} ~ {ep.period_end ?? "재직중"}
                            {gapLabel && <div className="text-[10px] mt-0.5">{gapLabel}</div>}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatDaysAsYM(ep.total_working_days)}
                            <span className="block text-[10px] text-muted-foreground font-normal">{ep.total_working_days.toLocaleString()}일</span>
                          </TableCell>

                          {/* 회사유형 (편집) */}
                          <TableCell>
                            <BadgeSelect
                              value={currentCat}
                              options={CATEGORY_OPTIONS}
                              onChange={(v) => updateEdit(ep.ep_id, "company_category", v)}
                              edited={catEdited}
                              editTooltip={catEdited
                                ? `AI 원본: ${CATEGORY_OPTIONS.find(o => o.value === ep.company_category)?.label}${ep.company_category_reason ? ` (${ep.company_category_reason})` : ""}`
                                : ep.company_category_reason ?? (ep.ranking_year && ep.ranking_position ? `${ep.ranking_year}년 시공능력평가 ${ep.ranking_position}위` : undefined)}
                            />
                          </TableCell>

                          {/* 고용형태 (편집 — 수기 입력 시 비활성) */}
                          <TableCell>
                            {isManual ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              <BadgeSelect
                                value={currentEmp}
                                options={EMPLOYMENT_OPTIONS}
                                onChange={(v) => updateEdit(ep.ep_id, "employment_type", v)}
                                edited={empEdited}
                                editTooltip={empEdited
                                  ? `AI 원본: ${EMPLOYMENT_OPTIONS.find(o => o.value === ep.employment_type)?.label}${ep.employment_type_reason ? ` (${ep.employment_type_reason})` : ""}`
                                  : ep.employment_type_reason ?? undefined}
                              />
                            )}
                          </TableCell>

                          {/* 기본률 */}
                          <TableCell className="text-right text-sm font-semibold">
                            {isManual ? <span className="text-muted-foreground">-</span> : <>{epBaseRate}%</>}
                          </TableCell>

                          {/* 계약조정 */}
                          <TableCell className="text-center text-sm font-semibold">
                            {isManual ? <span className="text-muted-foreground">-</span> : <>{epCalc.contractAdj ? "×0.8" : "-"}</>}
                          </TableCell>

                          {/* 최종률 */}
                          <TableCell className="text-right text-sm font-bold">
                            {isManual ? (
                              <input
                                type="text"
                                value={manualFinalRate}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/[^0-9.]/g, "");
                                  updateEdit(ep.ep_id, "manual_final_rate", parseFloat(v) || 0);
                                }}
                                className="w-16 h-7 text-right text-sm font-bold border rounded px-1 ring-2 ring-[var(--warning)]/60"
                              />
                            ) : (
                              <>{epCalc.finalRate}%</>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold">{ep.total_recognized_days.toLocaleString()}</TableCell>
                        </TableRow>

                        {/* 프로젝트 서브행 (읽기 전용) */}
                        {ep.projects.map((proj) => (
                          <TableRow key={`${ep.ep_id}-${proj.index}`} className="border-b-0">
                            <TableCell className={`border-l-4 ${color.border} text-muted-foreground text-xs pl-4`}>
                              {proj.index}
                            </TableCell>
                            <TableCell className={`text-xs pl-6 ${proj.recognized_days === 0 && proj.rate_note ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                              {proj.project_name ?? "-"}
                              {(proj.overlap_days ?? 0) > 0 && !proj.overlap_excluded && (
                                <span className="text-warning-muted-foreground ml-1">⚠ 중복 {proj.overlap_days}일 차감</span>
                              )}
                              {proj.rate_note?.includes("[3개월 미만") && (
                                <span className="text-warning-muted-foreground block">⚠ 3개월 미만 — 산정 제외</span>
                              )}
                              {proj.merged_children && proj.merged_children.length > 0 && (
                                <span className="block text-muted-foreground/60" title={proj.merged_children.map(c => `${c.project_name ?? "현장"} (${c.period_start} ~ ${c.period_end})`).join("\n")}>
                                  동일기간 현장 {proj.merged_children.length}건: {proj.merged_children.map(c => c.project_name ?? "현장").join(", ")}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {proj.period_start} ~ {proj.period_end}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{proj.working_days.toLocaleString()}</TableCell>
                            <TableCell colSpan={5} />
                            <TableCell className="text-right text-xs text-muted-foreground">{proj.recognized_days.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 학력 차감 */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">학력 차감 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">학력수준</span>
                <p className="font-medium">{summary.education_level ?? "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">차감연수</span>
                <p className="font-medium">{summary.education_deduction_years}년</p>
              </div>
              <div>
                <span className="text-muted-foreground">비고</span>
                <p className="font-medium">{summary.education_note ?? "-"}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t text-sm">
              <span className="text-muted-foreground">계산: </span>
              <span className="font-medium">
                인정연수 {formatYearsMonths(summary.total_recognized_years)} - 학력차감 {summary.education_deduction_years}년 = <strong>{formatYearsMonths(summary.final_career_years)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 수정 이력 */}
      {isRecalculated && appliedEdits.size > 0 && (
        <Card className="border-warning-border">
          <CardHeader>
            <CardTitle className="text-base">담당자 수정 항목 ({appliedEdits.size}건)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {Array.from(appliedEdits.entries()).map(([epId, edit]) => {
                const origEP = originalPeriods?.find((ep: EmploymentPeriod) => ep.ep_id === epId);
                const companyName = origEP?.company_name ?? epId;
                const changes: string[] = [];
                if (edit.employment_type !== undefined) {
                  const origLabel = EMPLOYMENT_OPTIONS.find(o => o.value === origEP?.employment_type)?.label ?? origEP?.employment_type;
                  const newLabel = EMPLOYMENT_OPTIONS.find(o => o.value === edit.employment_type)?.label ?? edit.employment_type;
                  changes.push(`고용형태: ${origLabel} → ${newLabel}`);
                }
                if (edit.company_category !== undefined) {
                  const origLabel = CATEGORY_OPTIONS.find(o => o.value === origEP?.company_category)?.label ?? origEP?.company_category;
                  const newLabel = CATEGORY_OPTIONS.find(o => o.value === edit.company_category)?.label ?? edit.company_category;
                  changes.push(`회사유형: ${origLabel} → ${newLabel}`);
                }
                return (
                  <div key={epId} className="flex items-start gap-2 py-1 border-b border-warning-border/60 last:border-0">
                    <span className="font-medium text-warning-muted-foreground">{companyName}</span>
                    <span className="text-muted-foreground">{changes.join(", ")}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 미해소 플래그 */}
      {flags.length > 0 && (() => {
        const flagLabel: Record<string, string> = {
          related_industry_check_needed: "업종 확인 필요",
          resume_only_period_check_needed: "이력서 기간 확인 필요",
          contract_status_uncertain: "고용형태 확인 필요",
          contract_pattern_detected: "비정규직 패턴 감지",
          company_category_uncertain: "회사유형 확인 필요",
          company_category_check_needed: "회사유형 확인 필요",
          small_company_check_needed: "소규모 업체 확인 필요",
          period_mismatch: "기간 불일치",
          period_mismatch_certificate_priority: "기간 불일치 (경력증명서 우선)",
          duplicate_career: "중복 경력",
          missing_certificate: "경력증명서 누락",
          no_certificate_submitted: "경력증명서 미제출",
          ai_merge_correction: "AI 병합 오류 보정",
          "AI 병합 오류 보정": "AI 병합 오류 보정",
          cert_issue_date_stale: "경력증명서 발급일 경과",
          cert_period_supplemented: "이력서 기준 기간 보완",
          cert_period_truncated: "발급일 기준 경력 절삭",
          post_issue_date_career: "발급일 이후 경력 (검증 불가)",
        };
        return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">미해소 항목 ({flags.length}건)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {flags.map((flag: {
              flag_type: string;
              related_career_index: number | null;
              description: string;
              impact: string;
            }, i: number) => (
              <Alert key={i} variant="warning">
                <AlertTitle className="text-sm font-semibold">
                  {flagLabel[flag.flag_type] ?? flag.flag_type}
                  {flag.related_career_index != null && (
                    <span className="text-xs font-normal ml-2 text-warning-muted-foreground">경력 #{flag.related_career_index}</span>
                  )}
                </AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  {flag.description}
                  {flag.impact && (
                    <span className="block mt-1 font-medium">영향: {flag.impact}</span>
                  )}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
        );
      })()}
    </div>
  );
}
