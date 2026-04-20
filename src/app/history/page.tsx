"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ApplicantSummary {
  id: string;
  applicant_name: string;
  applied_field: string;
  hiring_type: string;
  career_year_level: number | null;
  final_career_years: number | null;
  original_career_years: number | null;
  created_at: string;
  updated_at: string;
  analyst_name: string;
}

function fmtYM(years: number): string {
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (m === 0) return `${y}년`;
  return `${y}년 ${m}개월`;
}

export default function HistoryPage() {
  const [applicants, setApplicants] = useState<ApplicantSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feedbackCounts, setFeedbackCounts] = useState<Record<string, number>>({});
  const router = useRouter();

  const loadList = useCallback(async () => {
    setIsLoading(true);
    try {
      const [histRes, fbRes] = await Promise.all([
        fetch("/api/history"),
        fetch("/api/feedback"),
      ]);
      if (histRes.ok) {
        const data = await histRes.json();
        setApplicants(data.applicants);
      }
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        const counts: Record<string, number> = {};
        for (const fb of fbData.feedbacks ?? []) {
          if (fb.applicant_id) {
            counts[fb.applicant_id] = (counts[fb.applicant_id] ?? 0) + 1;
          }
        }
        setFeedbackCounts(counts);
      }
    } finally {
      setIsLoading(false);
      setSelected(new Set());
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name}의 분석 이력을 삭제하시겠습니까?`)) return;
    await fetch(`/api/history/${id}`, { method: "DELETE" });
    loadList();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    await Promise.all(
      Array.from(selected).map(id => fetch(`/api/history/${id}`, { method: "DELETE" }))
    );
    loadList();
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === applicants.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(applicants.map(a => a.id)));
    }
  };

  const handleOpen = (id: string) => {
    router.push(`/?load=${id}`);
  };

  const formatDate = (iso: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const hiringTypeLabel: Record<string, string> = {
    "일반": "일반",
    "전문직": "전문직",
    "현채직": "현채직",
    "general": "일반",
    "professional": "전문직",
    "site_hire": "현채직",
  };

  const allChecked = applicants.length > 0 && selected.size === applicants.length;

  return (
    <main className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display">지원자 분석 이력</h1>
          <p className="text-muted-foreground text-sm mt-1">
            이전에 분석한 지원자 이력을 확인하고 관리합니다.
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              선택 삭제 ({selected.size}건)
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/?reset=true")}>
            새 분석 시작
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">분석 이력 ({applicants.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">불러오는 중...</div>
          ) : applicants.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              저장된 분석 이력이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      className="rounded border-border"
                    />
                  </TableHead>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>지원자명</TableHead>
                  <TableHead>지원 직무</TableHead>
                  <TableHead>채용 유형</TableHead>
                  <TableHead>경력연차</TableHead>
                  <TableHead>피드백</TableHead>
                  <TableHead>분석자</TableHead>
                  <TableHead>분석일시</TableHead>
                  <TableHead>수정일시</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applicants.map((a, i) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleOpen(a.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="rounded border-border"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium">{a.applicant_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.applied_field}</Badge>
                    </TableCell>
                    <TableCell>{hiringTypeLabel[a.hiring_type] ?? a.hiring_type}</TableCell>
                    <TableCell>
                      {a.final_career_years != null ? (
                        <div>
                          <span className="font-semibold text-primary">{fmtYM(a.final_career_years)}</span>
                          {a.original_career_years != null && a.original_career_years !== a.final_career_years && (
                            <span className="block text-xs text-muted-foreground">AI: {fmtYM(a.original_career_years)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(feedbackCounts[a.id] ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-warning-muted text-warning-muted-foreground shadow-[0_0_0_1px_var(--warning-border)]">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          {feedbackCounts[a.id]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.analyst_name || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(a.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(a.id, a.applicant_name);
                        }}
                      >
                        삭제
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
