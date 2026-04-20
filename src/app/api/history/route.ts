import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

// 60초 캐시: get_all_users는 auth.users 전체를 스캔하므로 요청마다 호출하지 않는다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let userCache: { data: any[]; ts: number } | null = null;
async function getCachedUsers() {
  if (userCache && Date.now() - userCache.ts < 60_000) return userCache.data;
  const { data, error } = await getSupabase().schema("public").rpc("get_all_users");
  if (error) console.error("get_all_users error:", error);
  userCache = { data: data ?? [], ts: Date.now() };
  return userCache.data;
}

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
    const users = await getCachedUsers();
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

  // body.id가 제공된 경우 UUID 형식 검증 (storage key path-traversal 방지)
  const providedId = body.id as string | undefined;
  if (providedId !== undefined && providedId !== null && !UUID_RE.test(providedId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const id = providedId ?? crypto.randomUUID();

  // 파일 검증 (MIME + 크기)
  for (const f of [resumeFile, certificateFile]) {
    if (!f || f.size === 0) continue;
    if (f.type !== "application/pdf") {
      return NextResponse.json({ error: "PDF 파일만 업로드 가능합니다." }, { status: 415 });
    }
    if (f.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "파일 크기는 10MB를 초과할 수 없습니다." }, { status: 413 });
    }
  }

  let created_at = now;
  const { data: existing } = await getSupabase()
    .from("applicants")
    .select("created_at, user_id")
    .eq("id", id)
    .single();
  if (existing) {
    created_at = existing.created_at;
    // 소유권 확인: 다른 유저의 레코드는 admin이 아니면 덮어쓸 수 없음
    if (existing.user_id !== userId) {
      const admin = await isAdmin(userId);
      if (!admin) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
  }

  // PDF 파일 업로드 (병렬)
  const resumeUploadP = resumeFile && resumeFile.size > 0
    ? resumeFile.arrayBuffer().then((ab) =>
        getSupabase().storage
          .from(STORAGE_BUCKET)
          .upload(`${id}/resume.pdf`, Buffer.from(ab), {
            upsert: true,
            contentType: "application/pdf",
          })
      )
    : Promise.resolve(null);

  const certUploadP = certificateFile && certificateFile.size > 0
    ? certificateFile.arrayBuffer().then((ab) =>
        getSupabase().storage
          .from(STORAGE_BUCKET)
          .upload(`${id}/certificate.pdf`, Buffer.from(ab), {
            upsert: true,
            contentType: "application/pdf",
          })
      )
    : Promise.resolve(null);

  const [resumeRes, certRes] = await Promise.all([resumeUploadP, certUploadP]);
  const resumeUploaded = !!(resumeRes && !resumeRes.error);
  const certUploaded = !!(certRes && !certRes.error);

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
