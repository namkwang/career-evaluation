import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.CAREER_GEMINI_KEY!);

const SYSTEM_PROMPT = `당신은 건설회사 채용팀의 경력 분석 AI입니다.
지원자의 서류를 읽으면서 확인한 사실을 간결하게 보고하듯 말해주세요.

규칙:
- 존댓말, 짧은 문장 ("~확인됩니다", "~있습니다", "~하셨네요")
- 한 문장씩 줄바꿈으로 구분
- 5~8문장
- 사실 위주로 담백하게. 과한 감탄이나 칭찬 금지
- 지원자의 실제 회사명, 경력 기간, 자격증 등 구체적 정보를 언급
- 첫 문장: 지원자 이름과 함께 시작
- 마지막 문장: "경력을 분석하겠습니다." 류로 마무리
- JSON이 아닌 일반 텍스트로 출력
- 이모지 사용 금지
- 한국어 맞춤법과 띄어쓰기를 정확히 지킬 것`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { extractionResult } = body;

    if (!extractionResult) {
      return new Response("extractionResult required", { status: 400 });
    }

    // 데이터 요약 (토큰 절약)
    const resume = extractionResult.resumeData;
    const cert = extractionResult.certificateData;

    const summary = {
      name: resume?.personal_info?.name_korean ?? cert?.personal_info?.name_korean ?? "지원자",
      careers: (resume?.careers ?? []).slice(0, 10).map((c: { company_name: string; project_name: string; period_start: string; period_end: string; construction_type: string; task_type: string }) => ({
        company: c.company_name,
        project: c.project_name,
        period: `${c.period_start} ~ ${c.period_end ?? "재직중"}`,
        type: c.construction_type,
        task: c.task_type,
      })),
      certCareers: (cert?.technical_career ?? []).slice(0, 10).map((c: { company_name: string; project_name: string; construction_type: string }) => ({
        company: c.company_name,
        project: c.project_name,
        type: c.construction_type,
      })),
      education: resume?.education ?? cert?.education ?? [],
      certifications: resume?.certifications ?? cert?.certifications ?? [],
      hasCertificate: !!cert,
      careerCount: (resume?.careers?.length ?? 0) + (cert?.technical_career?.length ?? 0),
    };

    const userPrompt = `다음 지원자의 서류 내용을 보고 코멘트해주세요:\n\n${JSON.stringify(summary, null, 2)}`;

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { temperature: 0.9 },
    });

    const result = await model.generateContentStream(userPrompt);

    // ReadableStream으로 변환
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
          controller.close();
        } catch {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Commentary error:", error);
    return new Response("Commentary failed", { status: 500 });
  }
}
