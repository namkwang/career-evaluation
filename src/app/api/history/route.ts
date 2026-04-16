import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

// GET: 목록 조회
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = await isAdmin(userId);

  let query = getSupabase()
    .from("applicants")
    .select(
      "id, applicant_name, applied_field, hiring_type, career_year_level, final_career_years, original_career_years, created_at, updated_at, user_id"
    )
    .order("created_at", { ascending: false });

  if (!admin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applicants = (data ?? []) as Array<Record<string, unknown>>;

  // user_id → 사용자 이름/이메일 매핑
  const userIds = [...new Set(applicants.map((a) => a.user_id as string).filter(Boolean))];
  const userMap: Record<string, { name: string; email: string }> = {};

  if (userIds.length > 0) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: users } = await supabaseAdmin.rpc("get_all_users");
    if (users) {
      for (const u of users) {
        if (userIds.includes(u.id)) {
          userMap[u.id] = {
            name: u.raw_user_meta_data?.name ?? "",
            email: u.email ?? "",
          };
        }
      }
    }
  }

  const enriched = applicants.map((a) => ({
    ...a,
    analyst_name: userMap[a.user_id as string]?.name || userMap[a.user_id as string]?.email || "",
  }));

  return NextResponse.json({ applicants: enriched });
}

// POST: 저장 (신규 또는 업데이트) — multipart/form-data 또는 JSON
export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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
    user_id: userId,
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
