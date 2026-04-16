import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = await isAdmin(userId);

  // admin은 모든 피드백 삭제 가능, 일반 유저는 본인 것만
  let query = getSupabase().from("feedbacks").delete().eq("id", id);
  if (!admin) {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query.select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not found or not authorized" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
