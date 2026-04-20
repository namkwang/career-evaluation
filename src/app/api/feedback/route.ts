import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

// GET: 피드백 목록 조회
export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const applicantId = searchParams.get("applicant_id");

  let query = getSupabase()
    .from("feedbacks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (applicantId) {
    query = query.eq("applicant_id", applicantId);
  } else {
    const admin = await isAdmin(userId);
    if (!admin) {
      query = query.eq("user_id", userId);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feedbacks: data });
}

// POST: 피드백 저장
export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const body = await request.json();
  const { category, content, applicant_id, applicant_name, page, user_name } = body;

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("feedbacks")
    .insert({
      category: category ?? "improvement",
      content: content.trim(),
      applicant_id: applicant_id ?? null,
      applicant_name: applicant_name ?? null,
      page: page ?? null,
      user_name: user_name ?? null,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ feedback: data });
}
