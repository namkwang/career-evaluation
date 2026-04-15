"use client";

import { useEffect, useRef, useState } from "react";
import { NodeOrb } from "./node-orb";

interface AnalysisProgressProps {
  currentStep: number;
  streamedText: string;
  isStreaming: boolean;
  extractedFields?: string[];
}

const STEP_LABELS: Record<number, string> = {
  2: "서류 분석",
  3: "경력 병합",
  4: "고용형태 판정",
  5: "경력산정",
};

export function AnalysisProgress({ currentStep, streamedText, extractedFields = [] }: AnalysisProgressProps) {
  const [displayedChars, setDisplayedChars] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLenRef = useRef(0);

  // 전체 문장 목록 (스트리밍 완료된 텍스트에서 추출)
  const allLines = streamedText.split("\n").filter(l => l.trim());

  // 현재 타이핑 위치가 몇 번째 줄인지 계산
  let charCount = 0;
  let currentLineIdx = 0;
  let charInLine = 0;
  // 현재 표시된 글자가 몇번째 줄에 있는지
  charCount = 0;
  for (let li = 0; li < allLines.length; li++) {
    const lineLen = allLines[li].length;
    if (displayedChars <= charCount + lineLen + 1) {
      currentLineIdx = li;
      charInLine = displayedChars - charCount;
      break;
    }
    charCount += lineLen + 1; // +1 for \n
    currentLineIdx = li + 1;
  }

  // 사람이 말하는 속도로 한 글자씩 표시
  useEffect(() => {
    if (displayedChars >= streamedText.length) return;

    const currentChar = streamedText[displayedChars - 1];
    const nextChar = streamedText[displayedChars];

    let delay = 55;
    if (currentChar === "\n") {
      delay = 1500;
    } else if (/[.!?]/.test(currentChar ?? "") && (nextChar === "\n" || nextChar === " ")) {
      delay = 800;
    } else if (currentChar === ",") {
      delay = 200;
    }

    timerRef.current = setTimeout(() => {
      setDisplayedChars(prev => prev + 1);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [displayedChars, streamedText]);

  // 새 텍스트 도착 시 시작
  useEffect(() => {
    if (streamedText.length > 0 && displayedChars === 0) {
      setDisplayedChars(1);
    }
  }, [streamedText, displayedChars]);

  // 리셋 감지
  useEffect(() => {
    if (streamedText.length < prevLenRef.current) {
      setDisplayedChars(0);
    }
    prevLenRef.current = streamedText.length;
  }, [streamedText]);

  const isTyping = displayedChars < streamedText.length;
  const currentLine = allLines[currentLineIdx] ?? "";

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 space-y-8">
      {/* 단계 표시 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>단계 {currentStep} / 5</span>
        <span className="text-primary font-medium">{STEP_LABELS[currentStep] ?? "처리 중"}</span>
      </div>

      {/* 노드 네트워크 오브 */}
      <NodeOrb size={180} isActive={isTyping} />

      {/* 코멘터리 텍스트 — 현재 문장만 표시 */}
      <div className="w-full max-w-lg text-center min-h-[3rem] flex items-center justify-center">
        {allLines.length === 0 && (
          <p className="text-muted-foreground text-sm animate-pulse">AI가 서류를 분석하고 있습니다...</p>
        )}
        {currentLine && (
          <p className="text-base text-foreground transition-opacity duration-500">
            {currentLine.split("").map((char, ci) => {
              const visible = ci < charInLine;
              const isRecent = visible && ci >= charInLine - 3 && isTyping;
              const isSpace = char === " ";
              return (
                <span
                  key={`${currentLineIdx}-${ci}`}
                  className={isSpace ? "inline" : "inline-block transition-transform duration-150"}
                  style={{
                    visibility: visible ? "visible" : "hidden",
                    transform: !isSpace && isRecent ? "scale(1.15)" : "scale(1)",
                  }}
                >
                  {isSpace ? "\u00A0" : char}
                </span>
              );
            })}
            {isTyping && charInLine > 0 && charInLine < currentLine.length && (
              <span className="inline-block w-0.5 h-4 bg-primary/70 ml-0.5 animate-blink align-middle" />
            )}
          </p>
        )}
      </div>

      {/* 추출 필드 실시간 표시 (Step 2) — 부드러운 스크롤, 코멘터리 시작 시 fade out */}
      {extractedFields.length > 0 && (
        <div
          className="w-full max-w-md relative transition-opacity duration-1000"
          style={{ opacity: streamedText.length > 0 ? 0 : 1, height: 160 }}
        >
          {/* 상단 fade */}
          <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background to-transparent z-10" />
          {/* 하단 fade */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent z-10" />
          {/* 스크롤 컨텐츠 — 최신 항목이 항상 중앙에 오도록 위로 계속 이동 */}
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="text-sm font-mono text-center"
              style={{
                transition: "transform 0.5s ease-out",
                transform: `translateY(${80 - Math.max(0, extractedFields.length - 1) * 28}px)`,
              }}
            >
              {extractedFields.map((field, i) => {
                const distFromEnd = extractedFields.length - 1 - i;
                const opacity = distFromEnd <= 1 ? 1 : Math.max(0.1, 1 - (distFromEnd - 1) * 0.15);
                return (
                  <p
                    key={i}
                    className="text-foreground"
                    style={{ opacity, height: 28, lineHeight: "28px" }}
                  >
                    {field}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
