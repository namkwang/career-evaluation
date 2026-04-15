import fs from "fs";
import path from "path";

function parsePromptFile(filePath: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const content = fs.readFileSync(filePath, "utf-8");

  const systemMatch = content.match(
    /## System Prompt\s*\n\s*```\n([\s\S]*?)```/
  );
  const systemPrompt = systemMatch?.[1]?.trim() ?? "";

  const userMatch = content.match(
    /## User Prompt\s*\n\s*```\n([\s\S]*?)```/
  );
  const userPrompt = userMatch?.[1]?.trim() ?? "";

  return { systemPrompt, userPrompt };
}

const promptsDir = path.join(process.cwd(), "prompts");

// Step 1: 서류 추출
export function getResumeExtractionPrompt() {
  return parsePromptFile(path.join(promptsDir, "Step1_이력서_추출.md"));
}

export function getCertificateExtractionPrompt() {
  return parsePromptFile(path.join(promptsDir, "Step1_경력증명서_추출.md"));
}

// Step 2: 경력 병합 + 회사 확정
export function getStep2Prompt() {
  return parsePromptFile(path.join(promptsDir, "Step2_경력병합.md"));
}

// Step 3: 고용형태 판정
export function getStep3Prompt() {
  return parsePromptFile(path.join(promptsDir, "Step3_고용형태.md"));
}

// Step 4: 경력산정
export function getStep4Prompt() {
  return parsePromptFile(path.join(promptsDir, "Step4_경력산정.md"));
}
