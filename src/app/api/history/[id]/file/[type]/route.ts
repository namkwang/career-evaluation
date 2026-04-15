import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "applicants");

// GET: PDF 파일 서빙
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const { id, type } = await params;

  if (type !== "resume" && type !== "certificate") {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const filePath = path.join(DATA_DIR, `${id}_${type}.pdf`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${type}.pdf"`,
    },
  });
}
