import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-flash-latest";

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    const key = process.env.CAREER_GEMINI_KEY;
    if (!key) { throw new Error("CAREER_GEMINI_KEY environment variable is not set"); }
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

function getModel(systemPrompt: string, enableSearch = false) {
  return getGenAI().getGenerativeModel({
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

export function parseJsonResponse<T = unknown>(text: string): T {
  if (!text) { throw new Error("empty AI response"); }
  let cleaned = text.trim();
  // Strip ``` and ```json/JSON fences
  cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // First parse attempt
  try { return JSON.parse(cleaned) as T; } catch { /* Fall through */ }
  // Fallback: find first { or [ and last matching } or ] and try that slice
  const firstBrace = cleaned.search(/[[{]/);
  const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice) as T; } catch { /* Fall through */ }
  }
  throw new Error(`AI returned non-JSON: ${cleaned.slice(0, 200)}`);
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
