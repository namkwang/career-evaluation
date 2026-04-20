"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicantId?: string | null;
  applicantName?: string | null;
  currentPage?: string;
}

const CATEGORIES = [
  { value: "bug", label: "오류/버그" },
  { value: "improvement", label: "개선 요청" },
  { value: "question", label: "질문" },
];

export function FeedbackModal({ isOpen, onClose, applicantId, applicantName, currentPage }: FeedbackModalProps) {
  const [category, setCategory] = useState("improvement");
  const [content, setContent] = useState("");
  const [userName, setUserName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          content,
          applicant_id: applicantId,
          applicant_name: applicantName,
          page: currentPage,
          user_name: userName.trim() || null,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => {
          setContent("");
          setSubmitted(false);
          onClose();
        }, 1500);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [category, content, applicantId, applicantName, currentPage, userName, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative bg-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        {submitted ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">&#10003;</div>
            <p className="text-lg font-semibold">접수되었습니다</p>
            <p className="text-sm text-muted-foreground mt-1">소중한 의견 감사합니다.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display">개선 요청</h2>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>

            {applicantName && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 mb-4">
                관련 지원자: <span className="font-medium text-foreground">{applicantName}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">유형</label>
                <div className="flex gap-2">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        category === c.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-foreground/30"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">내용</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="어떤 점이 불편하셨나요? 어떻게 개선되면 좋을까요?"
                  className="w-full h-32 px-3 py-2 text-sm border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">작성자 <span className="text-muted-foreground font-normal">(선택)</span></label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="이름"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
              <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || isSubmitting}>
                {isSubmitting ? "접수 중..." : "접수"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
