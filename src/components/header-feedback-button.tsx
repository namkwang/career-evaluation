"use client";

import { useState } from "react";
import { FeedbackModal } from "@/components/feedback-modal";

export function HeaderFeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--warning-border)] bg-warning-muted text-warning-muted-foreground hover:bg-warning-muted/80 transition-colors"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        개선 요청
      </button>
      <FeedbackModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
