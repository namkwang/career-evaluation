"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/step-indicator";
import { UploadForm } from "@/components/upload-form";
import { ExtractionResult } from "@/components/extraction-result";
import { MergedCareerTable } from "@/components/merged-career-table";
import { FinalResult } from "@/components/final-result";
import { AnalysisProgress } from "@/components/analysis-progress";
import { FeedbackModal } from "@/components/feedback-modal";
import type { ExtractionResult as ExtractionResultType } from "@/lib/types";

const STEPS = ["서류 업로드", "AI 추출", "경력 병합", "고용형태 판정", "경력산정"];


export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">로딩...</div>}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(1);
  const [viewingStep, setViewingStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResultType | null>(null);
  const [formDataRef, setFormDataRef] = useState<FormData | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<{ resume?: File; certificate?: File } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mergeResult, setMergeResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [employmentResult, setEmploymentResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [finalResult, setFinalResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [originalFinalResult, setOriginalFinalResult] = useState<any>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // 파이프라인 abort 공유 ref (handleReset/unmount에서 abort)
  const pipelineAbortRef = useRef<AbortController | null>(null);

  // 코멘터리 스트리밍
  const [commentaryText, setCommentaryText] = useState("");
  const [isCommentaryStreaming, setIsCommentaryStreaming] = useState(false);
  // 추출 필드 실시간 표시
  const [extractedFields, setExtractedFields] = useState<string[]>([]);
  const startCommentary = useCallback(async (extraction: ExtractionResultType) => {
    setCommentaryText("");
    setIsCommentaryStreaming(true);
    try {
      const res = await fetch("/api/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractionResult: extraction }),
      });
      if (!res.ok || !res.body) {
        setIsCommentaryStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setCommentaryText(accumulated);
      }
    } catch {
      // 실패해도 분석은 계속 진행
    }
    setIsCommentaryStreaming(false);
  }, []);

  // URL 파라미터 처리: reset 또는 load
  useEffect(() => {
    const ac = new AbortController();

    // 새 분석 요청
    if (searchParams.get("reset") === "true") {
      setCurrentStep(1);
      setViewingStep(1);
      setExtractionResult(null);
      setMergeResult(null);
      setEmploymentResult(null);
      setFinalResult(null);
      setOriginalFinalResult(null);
      setError(null);
      setFormDataRef(null);
      setUploadedFiles(null);
      setSavedId(null);
      setCommentaryText("");
      setIsCommentaryStreaming(false);
      setExtractedFields([]);
      router.replace("/", { scroll: false });
      return () => ac.abort();
    }

    // 저장된 이력 불러오기
    const loadId = searchParams.get("load");
    if (!loadId) return () => ac.abort();

    setIsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/history/${loadId}`, { signal: ac.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (ac.signal.aborted) return;

        setSavedId(data.id);
        setExtractionResult(data.extractionResult);
        setMergeResult(data.mergeResult);
        setEmploymentResult(data.employmentResult);
        setFinalResult(data.finalResult);
        setOriginalFinalResult(data.originalFinalResult ?? data.finalResult);
        setCurrentStep(5);
        setViewingStep(5);

        // URL에서 load 파라미터 제거 (현재 URL이 여전히 ?load= 인 경우만)
        if (typeof window !== "undefined" && window.location.search.includes("load=")) {
          router.replace("/", { scroll: false });
        }
      } catch {
        // ignore (abort 포함)
      } finally {
        if (!ac.signal.aborted) setIsLoading(false);
      }
    })();

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 자동 저장
  const saveToHistory = useCallback(async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraction: any, merge: any, employment: any, final_: any, existingId?: string | null, files?: { resume?: File; certificate?: File } | null,
    // 클로저 대신 호출 측에서 신선한 값을 직접 전달할 수 있도록 옵션 제공
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalOverride?: any
  ) => {
    const name = extraction?.resumeData?.personal_info?.name_korean
      ?? employment?.applicant_name
      ?? "이름 미상";
    const summary = final_?.calculation_summary;

    // AI 원본 경력연차 (수정 전) — override 우선
    const effectiveOriginal = originalOverride !== undefined ? originalOverride : originalFinalResult;
    const origSummary = effectiveOriginal?.calculation_summary;

    const jsonPayload = {
      id: existingId ?? undefined,
      applicant_name: name,
      applied_field: employment?.applied_field ?? merge?.applied_field ?? "",
      hiring_type: employment?.hiring_type ?? merge?.hiring_type ?? "",
      career_year_level: summary?.career_year_level ?? null,
      final_career_years: summary?.final_career_years ?? null,
      original_career_years: origSummary?.final_career_years ?? summary?.final_career_years ?? null,
      has_resume: !!(files ?? uploadedFiles)?.resume,
      has_certificate: !!(files ?? uploadedFiles)?.certificate,
      extractionResult: extraction,
      mergeResult: merge,
      employmentResult: employment,
      finalResult: final_,
      originalFinalResult: effectiveOriginal ?? final_,
    };

    // PDF 파일이 있으면 FormData로 전송, 없으면 JSON
    let res: Response;
    const effectiveFiles = files ?? uploadedFiles;
    if (effectiveFiles && !existingId) {
      const fd = new FormData();
      fd.append("data", JSON.stringify(jsonPayload));
      if (effectiveFiles.resume) fd.append("resume", effectiveFiles.resume);
      if (effectiveFiles.certificate) fd.append("certificate", effectiveFiles.certificate);
      res = await fetch("/api/history", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonPayload),
      });
    }

    if (res.ok) {
      const data = await res.json();
      setSavedId(data.id);
      return data.id;
    }
    return null;
  }, [originalFinalResult, uploadedFiles]);

  const applied_field = formDataRef?.get("applied_field") as string ?? "건축";
  const hiring_type = formDataRef?.get("hiring_type") as string ?? "일반";

  // --- API 호출 헬퍼 ---
  async function callMerge(extractData: ExtractionResultType) {
    const res = await fetch("/api/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeData: extractData.resumeData,
        certificateData: extractData.certificateData,
        applied_field,
        hiring_type,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "병합 실패");
    const data = await res.json();
    setMergeResult(data.mergeResult);
    return data.mergeResult;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function callEmployment(merge: any) {
    const res = await fetch("/api/employment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mergeResult: merge,
        certificateWorkHistory: extractionResult?.certificateData?.work_history ?? null,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "고용형태 판정 실패");
    const data = await res.json();
    setEmploymentResult(data.employmentResult);
    return data.employmentResult;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function callCalculate(emp: any) {
    const res = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mergeResult: emp, applied_field, hiring_type }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "경력산정 실패");
    const data = await res.json();
    setFinalResult(data.calculateResult);
    return data.calculateResult;
  }

  // --- Step 2~5 자동 실행 (fromStep부터) ---
  const runFromStep = useCallback(async (fromStep: number) => {
    // 이전 파이프라인 abort 후 새 컨트롤러 설치
    pipelineAbortRef.current?.abort();
    const ac = new AbortController();
    pipelineAbortRef.current = ac;

    setIsLoading(true);
    setError(null);

    try {
      let extract = extractionResult;
      let merge = mergeResult;
      let emp = employmentResult;

      if (fromStep <= 2) {
        setCurrentStep(2);
        setViewingStep(2);
        const res = await fetch("/api/extract", { method: "POST", body: formDataRef!, signal: ac.signal });
        if (!res.ok) throw new Error((await res.json()).error || "추출 실패");
        extract = await res.json();
        if (ac.signal.aborted) return;
        setExtractionResult(extract);
      }

      if (fromStep <= 3) {
        setCurrentStep(3);
        setViewingStep(3);
        merge = await callMerge(extract!);
        if (ac.signal.aborted) return;
      }

      if (fromStep <= 4) {
        setCurrentStep(4);
        setViewingStep(4);
        emp = await callEmployment(merge);
        if (ac.signal.aborted) return;
      }

      setCurrentStep(5);
      setViewingStep(5);
      await callCalculate(emp);

    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      if (!ac.signal.aborted) setIsLoading(false);
      if (pipelineAbortRef.current === ac) pipelineAbortRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractionResult, mergeResult, employmentResult, formDataRef, applied_field, hiring_type]);

  // 서류 업로드 → 전체 실행
  const handleUploadSubmit = async (formData: FormData) => {
    // 이전 파이프라인 abort 후 새 컨트롤러 설치
    pipelineAbortRef.current?.abort();
    const ac = new AbortController();
    pipelineAbortRef.current = ac;

    setFormDataRef(formData);
    // 파일을 별도 보관 (FormData 전송 후 File이 소비되므로)
    const resumeFile = formData.get("resume") as File | null;
    const certFile = formData.get("certificate") as File | null;
    setUploadedFiles({
      resume: resumeFile ?? undefined,
      certificate: certFile ?? undefined,
    });
    // formDataRef가 바로 반영 안 되므로 직접 사용
    setIsLoading(true);
    setError(null);

    const af = formData.get("applied_field") as string ?? "건축";
    const ht = formData.get("hiring_type") as string ?? "일반";

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      setCurrentStep(2);
      setViewingStep(2);
      // 스트리밍 추출 — 실시간 필드 표시
      setExtractedFields([]);
      const extractRes = await fetch("/api/extract-stream", { method: "POST", body: formData, signal: ac.signal });
      if (!extractRes.ok || !extractRes.body) throw new Error("추출 실패");

      reader = extractRes.body.getReader();
      const decoder = new TextDecoder();
      let extractData: ExtractionResultType | null = null;
      let extractErrors: string[] | undefined;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (ac.signal.aborted) break;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 줄 단위로 파싱
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const colonIdx = line.indexOf(":");
          if (colonIdx < 0) continue;
          const type = line.slice(0, colonIdx);
          const data = line.slice(colonIdx + 1);

          if (type === "field") {
            setExtractedFields(prev => [...prev, data]);
          } else if (type === "status") {
            setExtractedFields(prev => [...prev, `— ${data}`]);
          } else if (type === "result") {
            try {
              const parsed = JSON.parse(data);
              extractData = parsed;
              extractErrors = parsed.errors;
            } catch { /* ignore */ }
          }
        }
      }

      if (ac.signal.aborted) return;
      if (!extractData) throw new Error("추출 결과를 받지 못했습니다.");

      if (extractErrors && extractErrors.length > 0) {
        setExtractionResult(extractData);
        setError(extractErrors.join("\n"));
        setIsLoading(false);
        return;
      }

      setExtractionResult(extractData);
      setWarnings((extractData as ExtractionResultType & { warnings?: string[] }).warnings ?? []);

      // 코멘터리 시작 (분석과 병렬 실행)
      startCommentary(extractData);

      setCurrentStep(3);
      setViewingStep(3);
      const mergeRes = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeData: extractData.resumeData,
          certificateData: extractData.certificateData,
          applied_field: af,
          hiring_type: ht,
        }),
        signal: ac.signal,
      });
      if (!mergeRes.ok) throw new Error((await mergeRes.json()).error || "병합 실패");
      const mergeData = await mergeRes.json();
      if (ac.signal.aborted) return;
      setMergeResult(mergeData.mergeResult);

      setCurrentStep(4);
      setViewingStep(4);
      const empRes = await fetch("/api/employment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mergeResult: mergeData.mergeResult,
          certificateWorkHistory: extractData.certificateData?.work_history ?? null,
        }),
        signal: ac.signal,
      });
      if (!empRes.ok) throw new Error((await empRes.json()).error || "고용형태 판정 실패");
      const empData = await empRes.json();
      if (ac.signal.aborted) return;
      setEmploymentResult(empData.employmentResult);

      setCurrentStep(5);
      setViewingStep(5);
      const calcRes = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeResult: empData.employmentResult, applied_field: af, hiring_type: ht }),
        signal: ac.signal,
      });
      if (!calcRes.ok) throw new Error((await calcRes.json()).error || "경력산정 실패");
      const calcData = await calcRes.json();
      if (ac.signal.aborted) return;
      setFinalResult(calcData.calculateResult);
      setOriginalFinalResult(calcData.calculateResult);

      // 자동 저장 — originalOverride로 신선한 calc 결과 직접 전달 (state는 다음 렌더에 반영되므로)
      await saveToHistory(
        extractData,
        mergeData.mergeResult,
        empData.employmentResult,
        calcData.calculateResult,
        null,
        { resume: resumeFile ?? undefined, certificate: certFile ?? undefined },
        calcData.calculateResult,
      );

    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      if (reader) {
        reader.cancel().catch(() => {});
      }
      if (!ac.signal.aborted) setIsLoading(false);
      if (pipelineAbortRef.current === ac) pipelineAbortRef.current = null;
    }
  };

  // 담당자 수정 후 코드 재계산 (AI 호출 없음)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDataUpdate = useCallback(async (newData: any) => {
    setFinalResult(newData);
    // 자동 저장
    await saveToHistory(extractionResult, mergeResult, employmentResult, newData, savedId);
  }, [extractionResult, mergeResult, employmentResult, savedId, saveToHistory]);

  const handleReset = () => {
    // 진행 중인 파이프라인 중단
    pipelineAbortRef.current?.abort();
    pipelineAbortRef.current = null;
    setCurrentStep(1);
    setViewingStep(1);
    setExtractionResult(null);
    setMergeResult(null);
    setEmploymentResult(null);
    setFinalResult(null);
    setOriginalFinalResult(null);
    setError(null);
    setWarnings([]);
    setFormDataRef(null);
    setSavedId(null);
    setCommentaryText("");
    setIsCommentaryStreaming(false);
    setExtractedFields([]);
  };

  // 언마운트 시 파이프라인 abort
  useEffect(() => {
    return () => {
      pipelineAbortRef.current?.abort();
      pipelineAbortRef.current = null;
    };
  }, []);



  // 재분석 버튼 (현재 보고 있는 단계부터 다시 실행)
  const RerunButton = ({ fromStep }: { fromStep: number }) => (
    <div className="flex gap-3 items-center mt-4">
      <button onClick={handleReset} className="text-sm text-muted-foreground hover:underline">
        처음부터 다시
      </button>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={() => runFromStep(fromStep)}
        disabled={isLoading}
      >
        이 단계부터 재분석
      </Button>
    </div>
  );

  return (
    <main className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">경력산정 자동화</h1>
        <p className="text-muted-foreground text-sm mt-1">
          이력서와 경력증명서를 업로드하면 AI가 경력을 분석하고 경력연차를 산정합니다.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <StepIndicator
            currentStep={viewingStep}
            maxReachedStep={currentStep}
            steps={STEPS}
            onStepClick={(step) => !isLoading && setViewingStep(step)}
          />
        </div>
        {viewingStep === 5 && savedId && (
          <button
            onClick={() => setFeedbackOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            개선 요청
          </button>
        )}
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        applicantId={savedId}
        applicantName={employmentResult?.applicant_name ?? mergeResult?.applicant_name ?? null}
        currentPage="경력산정"
      />

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-6 text-sm space-y-1">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {/* Step 1: 서류 업로드 */}
      {viewingStep === 1 && !isLoading && (
        <UploadForm onSubmit={handleUploadSubmit} isLoading={isLoading} />
      )}

      {/* 이력 로딩 중 */}
      {viewingStep === 1 && isLoading && (
        <div className="text-center py-20 text-muted-foreground">불러오는 중...</div>
      )}

      {/* 자동 실행 중 로딩 */}
      {isLoading && viewingStep >= 2 && (
        <AnalysisProgress
          currentStep={currentStep}
          streamedText={commentaryText}
          isStreaming={isCommentaryStreaming}
          extractedFields={extractedFields}
        />
      )}

      {/* Step 2: AI 추출 */}
      {viewingStep === 2 && !isLoading && extractionResult && (
        <div>
          <ExtractionResult
            resumeData={extractionResult.resumeData}
            certificateData={extractionResult.certificateData}
          />
          <RerunButton fromStep={2} />
        </div>
      )}

      {/* Step 3: 경력 병합 */}
      {viewingStep === 3 && !isLoading && mergeResult && (
        <div>
          <MergedCareerTable data={mergeResult} />
          <RerunButton fromStep={3} />
        </div>
      )}

      {/* Step 4: 고용형태 판정 */}
      {viewingStep === 4 && !isLoading && employmentResult && (
        <div>
          <MergedCareerTable data={employmentResult} />
          <RerunButton fromStep={4} />
        </div>
      )}

      {/* Step 5: 경력산정 */}
      {viewingStep === 5 && !isLoading && finalResult && (
        <div className="space-y-6">
          <FinalResult
            data={finalResult}
            originalData={originalFinalResult}
            employmentData={employmentResult}
            hiringType={formDataRef?.get("hiring_type") as string ?? "일반"}
            onDataUpdate={handleDataUpdate}
            workHistory={extractionResult?.certificateData?.work_history ?? null}
            mergeResult={mergeResult}
            savedId={savedId}
          />
          <div className="flex gap-3 items-center">
            <button onClick={handleReset} className="text-sm text-muted-foreground hover:underline">
              새로운 분석 시작
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
