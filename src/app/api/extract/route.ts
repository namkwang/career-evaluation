import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithDocument } from "@/lib/anthropic";
import {
  getResumeExtractionPrompt,
  getCertificateExtractionPrompt,
} from "@/lib/prompts";

export async function POST(request: NextRequest) {
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

    // Convert files to base64
    const resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    const resumeBase64 = resumeBuffer.toString("base64");

    const resumePrompt = getResumeExtractionPrompt();

    // Run extraction(s) in parallel
    const promises: Promise<unknown>[] = [
      callGeminiWithDocument(
        resumePrompt.systemPrompt,
        resumePrompt.userPrompt,
        resumeBase64
      ),
    ];

    if (certificateFile) {
      const certBuffer = Buffer.from(await certificateFile.arrayBuffer());
      const certBase64 = certBuffer.toString("base64");
      const certPrompt = getCertificateExtractionPrompt();
      promises.push(
        callGeminiWithDocument(
          certPrompt.systemPrompt,
          certPrompt.userPrompt,
          certBase64
        )
      );
    }

    const results = await Promise.all(promises);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeData = results[0] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const certificateData = results.length > 1 ? results[1] as any : null;

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

    // 중단 사유가 있으면 에러 반환
    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join("\n"), resumeData, certificateData },
        { status: 422 }
      );
    }

    // 5. 경력증명서 이름 추출 실패 → 중단
    if (certificateData && !certificateData?.personal_info?.name_korean) {
      errors.push("경력증명서에서 지원자 이름을 추출하지 못했습니다. 파일을 확인해주세요.");
    }

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
