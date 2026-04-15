"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Feedback {
  id: string;
  category: string;
  content: string;
  applicant_id: string | null;
  applicant_name: string | null;
  page: string | null;
  user_name: string | null;
  user_id: string | null;
  status: string;
  created_at: string;
}

const categoryLabel: Record<string, string> = {
  bug: "오류/버그",
  improvement: "개선 요청",
  question: "질문",
};

const categoryColor: Record<string, string> = {
  bug: "bg-red-100 text-red-700 border-red-200",
  improvement: "bg-orange-100 text-orange-700 border-orange-200",
  question: "bg-blue-100 text-blue-700 border-blue-200",
};

const statusLabel: Record<string, string> = {
  open: "접수",
  in_progress: "처리중",
  resolved: "완료",
};

const statusColor: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

function formatDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const loadList = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/feedback");
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data.feedbacks ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const filtered = filter === "all" ? feedbacks : feedbacks.filter(f => f.category === filter);

  const counts = {
    all: feedbacks.length,
    bug: feedbacks.filter(f => f.category === "bug").length,
    improvement: feedbacks.filter(f => f.category === "improvement").length,
    question: feedbacks.filter(f => f.category === "question").length,
  };

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">개선 요청 목록</h1>
          <p className="text-muted-foreground text-sm mt-1">
            사용자들이 접수한 개선 요청 및 오류 보고를 확인합니다.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          총 {feedbacks.length}건
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "all", label: "전체" },
          { key: "bug", label: "오류/버그" },
          { key: "improvement", label: "개선 요청" },
          { key: "question", label: "질문" },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label} ({counts[key as keyof typeof counts]})
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          {filter === "all" ? "접수된 피드백이 없습니다." : "해당 유형의 피드백이 없습니다."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(fb => (
            <Card key={fb.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={categoryColor[fb.category] ?? "bg-gray-100 text-gray-700"}>
                    {categoryLabel[fb.category] ?? fb.category}
                  </Badge>
                  <Badge variant="outline" className={statusColor[fb.status] ?? ""}>
                    {statusLabel[fb.status] ?? fb.status}
                  </Badge>
                  {fb.applicant_name && (
                    <span className="text-xs text-muted-foreground">
                      지원자: <span className="font-medium text-foreground">{fb.applicant_name}</span>
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{formatDate(fb.created_at)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{fb.content}</p>
                <div className="flex items-center justify-between mt-2">
                  {fb.user_name ? (
                    <p className="text-xs text-muted-foreground">작성자: {fb.user_name}</p>
                  ) : <span />}
                  {user && fb.user_id === user.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive text-xs h-7"
                      onClick={async () => {
                        if (!confirm("이 피드백을 삭제하시겠습니까?")) return;
                        await fetch(`/api/feedback/${fb.id}`, { method: "DELETE" });
                        loadList();
                      }}
                    >
                      삭제
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
