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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmploymentBadge } from "@/components/employment-badge";
import type { ResumeExtraction, CertificateExtraction } from "@/lib/types";

/* ─── 공통: 인적사항 카드 ─── */
function PersonalInfoCard({
  name,
  birthDate,
  phone,
  extra,
}: {
  name: string;
  birthDate: string;
  phone?: string | null;
  extra: { label: string; value: string };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">인적사항</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">성명</span>
            <p className="font-medium">{name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">생년월일</span>
            <p className="font-medium">{birthDate || "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">연락처</span>
            <p className="font-medium">{phone ?? "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{extra.label}</span>
            <p className="font-medium">{extra.value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── 공통: 학력 테이블 ─── */
function EducationTable({
  data,
}: {
  data: Array<{
    graduation_date: string;
    school_name: string;
    department: string | null;
    degree: string | null;
  }>;
}) {
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">학력</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>졸업일</TableHead>
              <TableHead>학교명</TableHead>
              <TableHead>학과</TableHead>
              <TableHead>학위</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((edu, i) => (
              <TableRow key={i}>
                <TableCell>{edu.graduation_date}</TableCell>
                <TableCell className="font-medium">{edu.school_name}</TableCell>
                <TableCell>{edu.department ?? "-"}</TableCell>
                <TableCell>{edu.degree ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ─── 공통: 자격증 테이블 ─── */
function CertificationsTable({
  data,
}: {
  data: Array<{
    type_and_grade: string;
    pass_date: string;
    registration_number?: string | null;
    issuing_body?: string | null;
  }>;
}) {
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">자격증</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>자격명</TableHead>
              <TableHead>취득일</TableHead>
              <TableHead>등록번호/발급기관</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((cert, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{cert.type_and_grade}</TableCell>
                <TableCell>{cert.pass_date}</TableCell>
                <TableCell>{cert.registration_number ?? cert.issuing_body ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ─── 이력서 결과 ─── */
function ResumeResult({ data }: { data: ResumeExtraction }) {
  const birthDisplay =
    data.personal_info.birth_date
    ?? (data.personal_info.birth_year ? `${data.personal_info.birth_year}년생` : null)
    ?? (data.personal_info.age ? `${data.personal_info.age}세` : null)
    ?? "-";

  return (
    <div className="space-y-6">
      <PersonalInfoCard
        name={data.personal_info.name_korean}
        birthDate={birthDisplay}
        phone={data.personal_info.phone}
        extra={{ label: "이력서 양식", value: data.resume_format_type }}
      />

      {/* 경력 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">경력 ({data.careers.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>회사명</TableHead>
                  <TableHead>현장/사업명</TableHead>
                  <TableHead>직위</TableHead>
                  <TableHead>담당업무</TableHead>
                  <TableHead>고용형태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const sorted = [...data.careers].sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));
                  return sorted.map((c, i) => {
                    let gapLabel: React.ReactNode = null;
                    if (i < sorted.length - 1) {
                      const prev = sorted[i + 1];
                      if (prev.period_end) {
                        const prevEnd = new Date(prev.period_end);
                        const currStart = new Date(c.period_start);
                        const gapDays = Math.round((currStart.getTime() - prevEnd.getTime()) / 86400000) - 1;
                        gapLabel = gapDays <= 1
                          ? <span className="text-green-500" title="기간 연속">↑ 연속</span>
                          : <span className="text-red-400" title={`${gapDays}일 공백`}>↑ {gapDays}일 공백</span>;
                      }
                    }
                    return (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {c.period_start} ~ {c.period_end ?? "재직중"}
                      {gapLabel && <div className="text-[10px] mt-0.5">{gapLabel}</div>}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{c.company_name}</TableCell>
                    <TableCell className="text-sm">{c.project_name ?? "-"}</TableCell>
                    <TableCell className="text-sm">{c.position ?? "-"}</TableCell>
                    <TableCell className="text-sm">{c.task_type ?? "-"}</TableCell>
                    <TableCell><EmploymentBadge type={c.employment_type} reason={c.employment_type_signals} /></TableCell>
                  </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EducationTable data={data.education} />
      <CertificationsTable data={data.certifications} />
    </div>
  );
}

/* ─── 경력증명서 결과 ─── */
function CertificateResult({ data }: { data: CertificateExtraction }) {
  return (
    <div className="space-y-6">
      <PersonalInfoCard
        name={data.personal_info.name_korean}
        birthDate={data.personal_info.birth_date}
        extra={{ label: "발급일", value: data.document_info.issue_date }}
      />

      {/* 기술경력 테이블 — 이력서와 동일 컬럼 구조 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기술경력 ({data.technical_career.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead>회사명</TableHead>
                  <TableHead>현장/사업명</TableHead>
                  <TableHead>직위(원문)</TableHead>
                  <TableHead>담당업무</TableHead>
                  <TableHead className="text-right">인정일수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const sorted = [...data.technical_career].sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? ""));
                  return sorted.map((tc, i) => {
                    let gapLabel: React.ReactNode = null;
                    if (i < sorted.length - 1) {
                      const prev = sorted[i + 1];
                      const prevEnd = new Date(prev.period_end);
                      const currStart = new Date(tc.period_start);
                      const gapDays = Math.round((currStart.getTime() - prevEnd.getTime()) / 86400000) - 1;
                      gapLabel = gapDays <= 1
                        ? <span className="text-green-500" title="기간 연속">↑ 연속</span>
                        : <span className="text-red-400" title={`${gapDays}일 공백`}>↑ {gapDays}일 공백</span>;
                    }
                    return (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {tc.period_start} ~ {tc.period_end}
                      {gapLabel && <div className="text-[10px] mt-0.5">{gapLabel}</div>}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{tc.company_name ?? "-"}</TableCell>
                    <TableCell className="text-sm">{tc.project_name}</TableCell>
                    <TableCell className="text-sm">{tc.position_raw}</TableCell>
                    <TableCell className="text-sm">{tc.task_type}</TableCell>
                    <TableCell className="text-right text-sm">{tc.recognized_days}일</TableCell>
                  </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EducationTable data={data.education} />
      <CertificationsTable data={data.certifications} />

      {/* 경력증명서 전용: 경력 요약 */}
      {data.career_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">경력 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">공사종류별</p>
                {data.career_summary.by_construction_type.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b">
                    <span>{item.type}</span>
                    <span className="font-medium">{item.recognized_days}일</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm py-1 font-semibold">
                  <span>합계</span>
                  <span>{data.career_summary.total_recognized_days_by_type}일</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── 메인 컴포넌트 ─── */
interface ExtractionResultProps {
  resumeData: ResumeExtraction;
  certificateData: CertificateExtraction | null;
}

export function ExtractionResult({ resumeData, certificateData }: ExtractionResultProps) {
  if (!certificateData) {
    return <ResumeResult data={resumeData} />;
  }

  return (
    <Tabs defaultValue="resume">
      <TabsList className="mb-4">
        <TabsTrigger value="resume">이력서 추출 결과</TabsTrigger>
        <TabsTrigger value="certificate">경력증명서 추출 결과</TabsTrigger>
      </TabsList>
      <TabsContent value="resume">
        <ResumeResult data={resumeData} />
      </TabsContent>
      <TabsContent value="certificate">
        <CertificateResult data={certificateData} />
      </TabsContent>
    </Tabs>
  );
}
