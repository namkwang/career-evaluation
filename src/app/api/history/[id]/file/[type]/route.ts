import { NextRequest, NextResponse } from "next/server";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

// GET: PDF 파일 서빙
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const { id, type } = await params;

  if (type !== "resume" && type !== "certificate") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const { data: row, error: rowError } = await getSupabase()
    .from("applicants")
    .select("user_id")
    .eq("id", id)
    .single();

  if (rowError || !row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (row.user_id !== userId) {
    const admin = await isAdmin(userId);
    if (!admin) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await getSupabase().storage
    .from(STORAGE_BUCKET)
    .download(`${id}/${type}.pdf`);

  if (error || !data) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${type}.pdf"`,
      "Content-Security-Policy": "sandbox",
    },
  });
}
