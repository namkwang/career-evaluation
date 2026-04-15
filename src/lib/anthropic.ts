import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-flash-latest";

const genAI = new GoogleGenerativeAI(process.env.CAREER_GEMINI_KEY!);

function getModel(systemPrompt: string, enableSearch = false) {
  return genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0,
      // @ts-expect-error - thinkingConfig is supported but not yet in types
      thinkingConfig: { thinkingBudget: 0 },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(enableSearch ? { tools: [{ googleSearch: {} }] as any } : {}),
  });
}

export function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// Step 1: PDF 추출 (웹검색 OFF)
export async function callGeminiWithDocument(
  systemPrompt: string,
  userPrompt: string,
  pdfBase64: string
) {
  const model = getModel(systemPrompt, false);

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64,
      },
    },
    { text: userPrompt },
  ]);

  const text = result.response.text();
  return parseJsonResponse(text);
}

// Step 1 스트리밍: PDF 추출 (웹검색 OFF) — 실시간 필드 추출용
export async function callGeminiWithDocumentStream(
  systemPrompt: string,
  userPrompt: string,
  pdfBase64: string
) {
  const model = getModel(systemPrompt, false);

  const result = await model.generateContentStream([
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64,
      },
    },
    { text: userPrompt },
  ]);

  return result;
}

// Step 2: 병합/회사확정 (웹검색 ON)
export async function callGeminiWithSearch(
  systemPrompt: string,
  userPrompt: string
) {
  const model = getModel(systemPrompt, true);
  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  return parseJsonResponse(text);
}

// Step 3: 경력산정 (웹검색 ON)
export async function callGemini(
  systemPrompt: string,
  userPrompt: string
) {
  const model = getModel(systemPrompt, true);
  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  return parseJsonResponse(text);
}
