import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "applicants");

// GET: 상세 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filePath = path.join(DATA_DIR, `${id}.json`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return NextResponse.json(content);
}

// DELETE: 삭제 (JSON + PDF 파일 모두)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const filePath = path.join(DATA_DIR, `${id}.json`);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  fs.unlinkSync(filePath);

  // PDF 파일도 삭제
  const resumePath = path.join(DATA_DIR, `${id}_resume.pdf`);
  const certPath = path.join(DATA_DIR, `${id}_certificate.pdf`);
  if (fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
  if (fs.existsSync(certPath)) fs.unlinkSync(certPath);

  return NextResponse.json({ deleted: true });
}
