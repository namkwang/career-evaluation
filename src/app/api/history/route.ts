import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data", "applicants");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// GET: 목록 조회
export async function GET() {
  ensureDir();

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
  const list = files.map(f => {
    const content = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
    return {
      id: content.id,
      applicant_name: content.applicant_name,
      applied_field: content.applied_field,
      hiring_type: content.hiring_type,
      career_year_level: content.career_year_level,
      final_career_years: content.final_career_years,
      original_career_years: content.original_career_years ?? content.final_career_years,
      created_at: content.created_at,
      updated_at: content.updated_at,
    };
  });

  // 최신순 정렬
  list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return NextResponse.json({ applicants: list });
}

// POST: 저장 (신규 또는 업데이트) — multipart/form-data 또는 JSON
export async function POST(request: NextRequest) {
  ensureDir();
  const now = new Date().toISOString();

  let body: Record<string, unknown>;
  let resumeFile: File | null = null;
  let certificateFile: File | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = JSON.parse(formData.get("data") as string);
    resumeFile = formData.get("resume") as File | null;
    certificateFile = formData.get("certificate") as File | null;
  } else {
    body = await request.json();
  }

  const id = (body.id as string) ?? crypto.randomUUID();
  const filePath = path.join(DATA_DIR, `${id}.json`);

  let created_at = now;
  if (fs.existsSync(filePath)) {
    const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    created_at = existing.created_at;
  }

  // PDF 파일 저장
  const hasResume = body.has_resume ?? false;
  const hasCertificate = body.has_certificate ?? false;

  if (resumeFile && resumeFile.size > 0) {
    const buf = Buffer.from(await resumeFile.arrayBuffer());
    fs.writeFileSync(path.join(DATA_DIR, `${id}_resume.pdf`), buf);
  }
  if (certificateFile && certificateFile.size > 0) {
    const buf = Buffer.from(await certificateFile.arrayBuffer());
    fs.writeFileSync(path.join(DATA_DIR, `${id}_certificate.pdf`), buf);
  }

  // 파일 존재 여부 기록
  const resumeExists = hasResume || resumeFile !== null || fs.existsSync(path.join(DATA_DIR, `${id}_resume.pdf`));
  const certExists = hasCertificate || certificateFile !== null || fs.existsSync(path.join(DATA_DIR, `${id}_certificate.pdf`));

  const record = {
    id,
    applicant_name: body.applicant_name ?? "이름 미상",
    applied_field: body.applied_field ?? "",
    hiring_type: body.hiring_type ?? "",
    career_year_level: body.career_year_level ?? null,
    final_career_years: body.final_career_years ?? null,
    original_career_years: body.original_career_years ?? body.final_career_years ?? null,
    has_resume: resumeExists,
    has_certificate: certExists,
    created_at,
    updated_at: now,
    extractionResult: body.extractionResult ?? null,
    mergeResult: body.mergeResult ?? null,
    employmentResult: body.employmentResult ?? null,
    finalResult: body.finalResult ?? null,
    originalFinalResult: body.originalFinalResult ?? body.finalResult ?? null,
    appliedEdits: body.appliedEdits ?? null,
  };

  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");

  return NextResponse.json({ id, saved: true });
}
