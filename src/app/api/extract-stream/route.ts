import { NextRequest, NextResponse } from "next/server";
import { callGeminiWithDocumentStream, parseJsonResponse } from "@/lib/anthropic";
import {
  getResumeExtractionPrompt,
  getCertificateExtractionPrompt,
} from "@/lib/prompts";
import { getAuthUserId } from "@/lib/supabase-server";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

// 스트리밍 텍스트에서 추출 가능한 필드를 정규식으로 뽑기
function extractFields(text: string): string[] {
  const fields: string[] = [];
  const seen = new Set<string>();

  // 이름
  const nameMatch = text.match(/"name_korean"\s*:\s*"([^"]+)"/);
  if (nameMatch && !seen.has("name")) {
    seen.add("name");
    fields.push(`이름: ${nameMatch[1]}`);
  }

  // 회사명
  const companyMatches = text.matchAll(/"company_name"\s*:\s*"([^"]+)"/g);
  for (const m of companyMatches) {
    const key = `company:${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(`회사: ${m[1]}`);
    }
  }

  // 프로젝트명
  const projectMatches = text.matchAll(/"project_name"\s*:\s*"([^"]+)"/g);
  for (const m of projectMatches) {
    const key = `project:${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(`현장: ${m[1]}`);
    }
  }

  // 학교명
  const schoolMatches = text.matchAll(/"school_name"\s*:\s*"([^"]+)"/g);
  for (const m of schoolMatches) {
    const key = `school:${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(`학교: ${m[1]}`);
    }
  }

  // 자격증
  const certMatches = text.matchAll(/"type_and_grade"\s*:\s*"([^"]+)"/g);
  for (const m of certMatches) {
    const key = `cert:${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(`자격증: ${m[1]}`);
    }
  }

  return fields;
}

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
      return new Response(JSON.stringify({ error: "이력서 PDF를 업로드해주세요." }), { status: 400 });
    }

    // 파일 검증 (MIME + 크기)
    for (const f of [resumeFile, certificateFile]) {
      if (!f || f.size === 0) continue;
      if (f.type !== "application/pdf") {
        return new Response(
          JSON.stringify({ error: "PDF 파일만 업로드 가능합니다." }),
          { status: 415 }
        );
      }
      if (f.size > MAX_PDF_BYTES) {
        return new Response(
          JSON.stringify({ error: "파일 크기는 10MB를 초과할 수 없습니다." }),
          { status: 413 }
        );
      }
    }

    const resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    const resumeBase64 = resumeBuffer.toString("base64");
    const resumePrompt = getResumeExtractionPrompt();

    let certBase64: string | null = null;
    let certPrompt: { systemPrompt: string; userPrompt: string } | null = null;
    if (certificateFile) {
      const certBuffer = Buffer.from(await certificateFile.arrayBuffer());
      certBase64 = certBuffer.toString("base64");
      certPrompt = getCertificateExtractionPrompt();
    }

    const encoder = new TextEncoder();
    // 클라이언트 연결이 끊어지면 업스트림 Gemini 호출도 중단
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onAbort);

    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: string) => {
          controller.enqueue(encoder.encode(`${type}:${data}\n`));
        };

        try {
          // 이력서 스트리밍 추출
          const resumeStream = await callGeminiWithDocumentStream(
            resumePrompt.systemPrompt,
            resumePrompt.userPrompt,
            resumeBase64
          );

          let resumeFullText = "";
          const sentFields = new Set<string>();

          try {
            for await (const chunk of resumeStream.stream) {
              if (abortController.signal.aborted) break;
              const chunkText = chunk.text();
              if (chunkText) {
                resumeFullText += chunkText;
                // 새로 추출된 필드 전송
                const fields = extractFields(resumeFullText);
                for (const f of fields) {
                  if (!sentFields.has(f)) {
                    sentFields.add(f);
                    send("field", f);
                  }
                }
              }
            }
          } catch (err) {
            send("error", err instanceof Error ? err.message : "이력서 스트리밍 중 오류");
            controller.close();
            request.signal.removeEventListener("abort", onAbort);
            return;
          }

          // 이력서 JSON 파싱
          let resumeData: unknown;
          try {
            resumeData = parseJsonResponse(resumeFullText);
          } catch {
            resumeData = null;
            send("status", "이력서 파싱 실패");
          }

          // 경력증명서 스트리밍 추출
          let certificateData: unknown = null;
          if (certBase64 && certPrompt) {
            send("status", "경력증명서를 확인하고 있습니다...");
            const certStream = await callGeminiWithDocumentStream(
              certPrompt.systemPrompt,
              certPrompt.userPrompt,
              certBase64
            );

            let certFullText = "";
            try {
              for await (const chunk of certStream.stream) {
                if (abortController.signal.aborted) break;
                const chunkText = chunk.text();
                if (chunkText) {
                  certFullText += chunkText;
                  const fields = extractFields(certFullText);
                  for (const f of fields) {
                    if (!sentFields.has(f)) {
                      sentFields.add(f);
                      send("field", f);
                    }
                  }
                }
              }
            } catch (err) {
              send("error", err instanceof Error ? err.message : "경력증명서 스트리밍 중 오류");
              controller.close();
              request.signal.removeEventListener("abort", onAbort);
              return;
            }

            try {
              certificateData = parseJsonResponse(certFullText);
            } catch {
              certificateData = null;
              send("status", "경력증명서 파싱 실패");
            }
          }

          // 검증
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rd = resumeData as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cd = certificateData as any;
          const errors: string[] = [];
          const warnings: string[] = [];

          if (rd?.document_info?.document_confirmation_number && !rd?.resume_format_type) {
            errors.push("이력서 칸에 경력증명서가 업로드되었습니다.");
          }
          if (cd && cd?.resume_format_type && !cd?.document_info?.document_confirmation_number) {
            errors.push("경력증명서 칸에 이력서가 업로드되었습니다.");
          }
          if (cd) {
            const rn = rd?.personal_info?.name_korean?.trim();
            const cn = cd?.personal_info?.name_korean?.trim();
            if (rn && cn && rn !== cn) {
              errors.push(`이력서(${rn})와 경력증명서(${cn})의 이름이 다릅니다.`);
            }
          }
          if (!rd?.personal_info?.name_korean) {
            errors.push("이력서에서 이름을 추출하지 못했습니다.");
          }
          if (cd && !cd?.personal_info?.name_korean) {
            errors.push("경력증명서에서 이름을 추출하지 못했습니다.");
          }
          if (rd?.careers?.length === 0 && rd?.work_history?.length === 0) {
            warnings.push("이력서에서 경력 정보를 추출하지 못했습니다.");
          }

          // --- 이력서 careers에서 경력증명서와 대조하여 유령 항목 제거 ---
          // 경력증명서가 있고, 같은 회사에 경력증명서 경력이 있는데
          // 경력증명서 기간 범위 밖인 이력서 경력은 제거
          if (rd?.careers && cd?.technical_career && cd.technical_career.length > 0) {
            const normN = (s: string) => (s ?? "").replace(/\(주\)|㈜|주식회사|\s/g, "");
            // 경력증명서 회사별 기간 수집 (work_history 기준)
            const certWH = cd.work_history ?? [];
            const whPeriods = new Map<string, Array<{ start: number; end: number }>>();
            for (const wh of certWH) {
              const key = normN(wh.company_name);
              if (!whPeriods.has(key)) whPeriods.set(key, []);
              whPeriods.get(key)!.push({
                start: new Date(wh.period_start).getTime(),
                end: wh.period_end ? new Date(wh.period_end).getTime() : Date.now(),
              });
            }
            if (whPeriods.size > 0) {
              rd.careers = rd.careers.filter((c: { company_name: string; period_start: string; period_end: string }) => {
                const key = normN(c.company_name);
                const periods = whPeriods.get(key);
                if (!periods) return true; // 경력증명서에 없는 회사 → 유지
                const cStart = new Date(c.period_start).getTime();
                const cEnd = new Date(c.period_end).getTime();
                // work_history 기간 범위 안에 있으면 유지, 밖이면 제거
                return periods.some(p => cStart >= p.start - 86400000 && cEnd <= p.end + 86400000);
              });
            }
          }

          // 최종 결과 전송
          const result = {
            resumeData: rd,
            certificateData: cd,
            warnings: warnings.length > 0 ? warnings : undefined,
            errors: errors.length > 0 ? errors : undefined,
          };

          send("result", JSON.stringify(result));
          send("status", "추출 완료");
        } catch (err) {
          send("error", err instanceof Error ? err.message : "추출 중 오류");
        }

        controller.close();
        request.signal.removeEventListener("abort", onAbort);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Extract stream error:", error);
    return new Response(JSON.stringify({ error: "추출 중 오류가 발생했습니다." }), { status: 500 });
  }
}
