"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { CategoryBadge } from "@/components/category-badge";
import { EmploymentBadge } from "@/components/employment-badge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface MergedCareerTableProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export function MergedCareerTable({ data }: MergedCareerTableProps) {
  const careers = [...(data?.merged_careers ?? [])].sort(
    (a: { period_start: string }, b: { period_start: string }) =>
      (b.period_start ?? "").localeCompare(a.period_start ?? "")
  );
  const flags = data?.verification_summary ?? [];

  return (
    <div className="space-y-6">
      {/* 검증 필요 항목 */}
      {flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">검증 필요 항목 ({flags.length}건)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {flags.map((flag: { flag_type: string; description: string; related_career_index: number | null; requires_interview: boolean }, i: number) => (
              <Alert key={i} variant="destructive" className="bg-amber-50 border-amber-200 text-amber-900">
                <AlertTitle className="text-sm font-semibold">
                  {flag.flag_type}
                  {flag.related_career_index != null && (
                    <span className="text-xs font-normal ml-2 text-amber-600">경력 #{flag.related_career_index}</span>
                  )}
                  {flag.requires_interview && (
                    <Badge variant="destructive" className="ml-2 text-xs">면담필요</Badge>
                  )}
                </AlertTitle>
                <AlertDescription className="text-xs mt-1">{flag.description}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 병합된 경력 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">병합된 경력 ({careers.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>회사명</TableHead>
                  <TableHead>현장명</TableHead>
                  <TableHead>직위</TableHead>
                  <TableHead>업무</TableHead>
                  <TableHead>고용형태</TableHead>
                  <TableHead>회사유형</TableHead>
                  <TableHead className="text-right">근무일수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {careers.map((career: {
                  index: number;
                  period_start: string;
                  period_end: string;
                  company_name: string;
                  project_name: string | null;
                  position: string | null;
                  task_type: string | null;
                  employment_type: string;
                  employment_type_reason: string | null;
                  company_category: string;
                  ranking_year: number | null;
                  ranking_position: number | null;
                  continuous_group_id: string | null;
                  working_days: number;
                  verification_flags: string[];
                  source: string;
                }, i: number) => {
                  const hasFlags = career.verification_flags?.length > 0;

                  // 연속/단절 표시
                  let gapLabel: React.ReactNode = null;
                  if (i < careers.length - 1) {
                    const prev = careers[i + 1] as { period_end: string };
                    const prevEnd = new Date(prev.period_end);
                    const currStart = new Date(career.period_start);
                    const gapDays = Math.round((currStart.getTime() - prevEnd.getTime()) / 86400000) - 1;
                    gapLabel = gapDays <= 1
                      ? <span className="text-green-500" title="기간 연속">↑ 연속</span>
                      : <span className="text-red-400" title={`${gapDays}일 공백`}>↑ {gapDays}일 공백</span>;
                  }

                  return (
                    <TableRow
                      key={i}
                      className={cn(
                        hasFlags && "bg-amber-50"
                      )}
                    >
                      <TableCell className="text-muted-foreground text-xs">
                        {career.index ?? i + 1}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {career.period_start} ~ {career.period_end}
                        {gapLabel && <div className="text-[10px] mt-0.5">{gapLabel}</div>}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{career.company_name}</TableCell>
                      <TableCell className="text-sm">{career.project_name ?? "-"}</TableCell>
                      <TableCell className="text-sm">{career.position ?? "-"}</TableCell>
                      <TableCell className="text-sm">{career.task_type ?? "-"}</TableCell>
                      <TableCell><EmploymentBadge type={career.employment_type} reason={career.employment_type_reason} /></TableCell>
                      <TableCell><CategoryBadge category={career.company_category} rankingYear={career.ranking_year} rankingPosition={career.ranking_position} /></TableCell>
                      <TableCell className="text-right text-sm">{career.working_days}일</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


    </div>
  );
}
