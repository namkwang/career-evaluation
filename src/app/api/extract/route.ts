import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithDocument } from "@/lib/anthropic";
import {
  getResumeExtractionPrompt,
  getCertificateExtractionPrompt,
} from "@/lib/prompts";
import { getAuthUserId } from "@/lib/supabase-server";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const resumeFile = formData.get("resume") as File | null;
    const certificateFile = formData.get("certificate") as File | null;

    if (!resumeFile) {
      return NextResponse.json(
        { error: "이력서 PDF를 업로드해주세요." },
        { status: 400 }
      );
    }

    // 파일 검증 (MIME + 크기)
    for (const f of [resumeFile, certificateFile]) {
      if (!f || f.size === 0) continue;
      if (f.type !== "application/pdf") {
        return NextResponse.json(
          { error: "PDF 파일만 업로드 가능합니다." },
          { status: 415 }
        );
      }
      if (f.size > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: "파일 크기는 10MB를 초과할 수 없습니다." },
          { status: 413 }
        );
      }
    }

    // Convert files to base64
    const resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    const resumeBase64 = resumeBuffer.toString("base64");

    const resumePrompt = getResumeExtractionPrompt();

    // Run extraction(s) in parallel — 이력서가 핵심, 경력증명서는 실패해도 진행
    const resumePromise = callGeminiWithDocument(
      resumePrompt.systemPrompt,
      resumePrompt.userPrompt,
      resumeBase64
    );

    let certPromise: Promise<unknown> | null = null;
    if (certificateFile) {
      const certBuffer = Buffer.from(await certificateFile.arrayBuffer());
      const certBase64 = certBuffer.toString("base64");
      const certPrompt = getCertificateExtractionPrompt();
      certPromise = callGeminiWithDocument(
        certPrompt.systemPrompt,
        certPrompt.userPrompt,
        certBase64
      );
    }

    const [resumeSettled, certSettled] = await Promise.all([
      resumePromise.then(
        (v) => ({ status: "fulfilled" as const, value: v }),
        (e: unknown) => ({ status: "rejected" as const, reason: e }),
      ),
      certPromise
        ? certPromise.then(
            (v) => ({ status: "fulfilled" as const, value: v }),
            (e: unknown) => ({ status: "rejected" as const, reason: e }),
          )
        : Promise.resolve(null),
    ]);

    if (resumeSettled.status === "rejected") {
      console.error("Resume extraction failed:", resumeSettled.reason);
      return NextResponse.json(
        {
          error:
            resumeSettled.reason instanceof Error
              ? resumeSettled.reason.message
              : "이력서 추출 중 오류가 발생했습니다.",
        },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeData = resumeSettled.value as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let certificateData: any = null;
    if (certSettled) {
      if (certSettled.status === "fulfilled") {
        certificateData = certSettled.value;
      } else {
        console.warn(
          "Certificate extraction failed, proceeding with resume only:",
          certSettled.reason
        );
        certificateData = null;
      }
    }

    // === 엣지 케이스 검증 ===
    const errors: string[] = [];   // 중단 (분석 진행 불가)
    const warnings: string[] = []; // 경고 (분석은 계속)

    // 1. 이력서 칸에 경력증명서를 올렸는지 확인 → 중단
    if (resumeData?.document_info?.document_confirmation_number && !resumeData?.resume_format_type) {
      errors.push("이력서 칸에 경력증명서가 업로드되었습니다. 파일을 확인해주세요.");
    }

    // 2. 경력증명서 칸에 이력서를 올렸는지 확인 → 중단
    if (certificateData && certificateData?.resume_format_type && !certificateData?.document_info?.document_confirmation_number) {
      errors.push("경력증명서 칸에 이력서가 업로드되었습니다. 파일을 확인해주세요.");
    }

    // 3. 서류 간 지원자 이름 불일치 → 중단
    if (certificateData) {
      const resumeName = resumeData?.personal_info?.name_korean?.trim();
      const certName = certificateData?.personal_info?.name_korean?.trim();
      if (resumeName && certName && resumeName !== certName) {
        errors.push(`이력서(${resumeName})와 경력증명서(${certName})의 지원자 이름이 다릅니다.`);
      }
    }

    // 4. 이력서에서 이름 추출 실패 → 중단
    if (!resumeData?.personal_info?.name_korean) {
      errors.push("이력서에서 지원자 이름을 추출하지 못했습니다. 파일 품질을 확인해주세요.");
    }

    // 5. 경력증명서 이름 추출 실패 → 중단 (이전에는 이른 return 뒤에 있어서 실행되지 않았음)
    if (certificateData && !certificateData?.personal_info?.name_korean) {
      errors.push("경력증명서에서 지원자 이름을 추출하지 못했습니다. 파일을 확인해주세요.");
    }

    // 중단 사유가 있으면 에러 반환
    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join("\n"), resumeData, certificateData },
        { status: 422 }
      );
    }

    // 6. 경고 수준 (분석은 계속)
    if (resumeData?.careers?.length === 0 && resumeData?.work_history?.length === 0) {
      warnings.push("이력서에서 경력 정보를 추출하지 못했습니다.");
    }

    return NextResponse.json({
      resumeData,
      certificateData,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "추출 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
