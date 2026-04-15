import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data", "feedback");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// GET: 피드백 목록 조회
export async function GET(request: NextRequest) {
  ensureDir();
  const { searchParams } = new URL(request.url);
  const applicantId = searchParams.get("applicant_id");

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
  let list = files.map(f => {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
  });

  // 특정 지원자 필터
  if (applicantId) {
    list = list.filter(f => f.applicant_id === applicantId);
  }

  // 최신순 정렬
  list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return NextResponse.json({ feedbacks: list });
}

// POST: 피드백 저장
export async function POST(request: NextRequest) {
  ensureDir();

  const body = await request.json();
  const { category, content, applicant_id, applicant_name, page, user_name } = body;

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const feedback = {
    id,
    category: category ?? "improvement",
    content: content.trim(),
    applicant_id: applicant_id ?? null,
    applicant_name: applicant_name ?? null,
    page: page ?? null,
    user_name: user_name ?? null,
    status: "open",
    created_at: now,
  };

  fs.writeFileSync(
    path.join(DATA_DIR, `${id}.json`),
    JSON.stringify(feedback, null, 2),
    "utf-8"
  );

  return NextResponse.json({ feedback });
}
