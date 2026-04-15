import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";

// GET: 목록 조회
export async function GET() {
  const { data, error } = await getSupabase()
    .from("applicants")
    .select(
      "id, applicant_name, applied_field, hiring_type, career_year_level, final_career_years, original_career_years, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ applicants: data ?? [] });
}

// POST: 저장 (신규 또는 업데이트) — multipart/form-data 또는 JSON
export async function POST(request: NextRequest) {
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

  let created_at = now;
  const { data: existing } = await getSupabase()
    .from("applicants")
    .select("created_at")
    .eq("id", id)
    .single();
  if (existing) {
    created_at = existing.created_at;
  }

  // PDF 파일 업로드
  let resumeUploaded = false;
  let certUploaded = false;

  if (resumeFile && resumeFile.size > 0) {
    const buf = Buffer.from(await resumeFile.arrayBuffer());
    await getSupabase().storage
      .from(STORAGE_BUCKET)
      .upload(`${id}/resume.pdf`, buf, { upsert: true, contentType: "application/pdf" });
    resumeUploaded = true;
  }
  if (certificateFile && certificateFile.size > 0) {
    const buf = Buffer.from(await certificateFile.arrayBuffer());
    await getSupabase().storage
      .from(STORAGE_BUCKET)
      .upload(`${id}/certificate.pdf`, buf, { upsert: true, contentType: "application/pdf" });
    certUploaded = true;
  }

  const hasResume = !!(body.has_resume || resumeUploaded);
  const hasCertificate = !!(body.has_certificate || certUploaded);

  const record = {
    id,
    applicant_name: (body.applicant_name as string) ?? "이름 미상",
    applied_field: (body.applied_field as string) ?? "",
    hiring_type: (body.hiring_type as string) ?? "",
    career_year_level: (body.career_year_level as string) ?? null,
    final_career_years: (body.final_career_years as number) ?? null,
    original_career_years:
      (body.original_career_years as number) ?? (body.final_career_years as number) ?? null,
    has_resume: hasResume,
    has_certificate: hasCertificate,
    created_at,
    updated_at: now,
    extraction_result: (body.extractionResult as object) ?? null,
    merge_result: (body.mergeResult as object) ?? null,
    employment_result: (body.employmentResult as object) ?? null,
    final_result: (body.finalResult as object) ?? null,
    original_final_result:
      (body.originalFinalResult as object) ?? (body.finalResult as object) ?? null,
    applied_edits: (body.appliedEdits as object) ?? null,
  };

  const { error } = await getSupabase().from("applicants").upsert(record);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id, saved: true });
}
