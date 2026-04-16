import { NextResponse } from "next/server";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ isAdmin: false });
  }

  const admin = await isAdmin(userId);
  return NextResponse.json({ isAdmin: admin });
}
