import { NextRequest, NextResponse } from "next/server";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";

// GET: PDF 파일 서빙
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const { id, type } = await params;

  if (type !== "resume" && type !== "certificate") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
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
    },
  });
}
