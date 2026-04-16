import { NextRequest, NextResponse } from "next/server";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

function mapToResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    applicant_name: row.applicant_name,
    applied_field: row.applied_field,
    hiring_type: row.hiring_type,
    career_year_level: row.career_year_level,
    final_career_years: row.final_career_years,
    original_career_years: row.original_career_years,
    has_resume: row.has_resume,
    has_certificate: row.has_certificate,
    created_at: row.created_at,
    updated_at: row.updated_at,
    extractionResult: row.extraction_result,
    mergeResult: row.merge_result,
    employmentResult: row.employment_result,
    finalResult: row.final_result,
    originalFinalResult: row.original_final_result,
    appliedEdits: row.applied_edits,
  };
}

// GET: 상세 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const admin = await isAdmin(userId);

  let query = getSupabase()
    .from("applicants")
    .select("*")
    .eq("id", id);

  if (!admin) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(mapToResponse(data as Record<string, unknown>));
}

// DELETE: 삭제 (DB 레코드 + Storage 파일)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const adminUser = await isAdmin(userId);

  let deleteQuery = getSupabase()
    .from("applicants")
    .delete()
    .eq("id", id);

  if (!adminUser) {
    deleteQuery = deleteQuery.eq("user_id", userId);
  }

  const { error: dbError } = await deleteQuery;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  await getSupabase().storage
    .from(STORAGE_BUCKET)
    .remove([`${id}/resume.pdf`, `${id}/certificate.pdf`]);

  return NextResponse.json({ deleted: true });
}
