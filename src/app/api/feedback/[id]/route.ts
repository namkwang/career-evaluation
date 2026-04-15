import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/supabase-server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 본인이 작성한 피드백만 삭제 가능
  const { data, error } = await getSupabase()
    .from("feedbacks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not found or not authorized" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
