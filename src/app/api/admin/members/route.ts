import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUserId, isAdmin } from "@/lib/supabase-server";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(userId);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("get_all_users");

  if (error) {
    console.error("get_all_users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }

  const members = (data ?? []).map((u: { id: string; email: string; raw_user_meta_data: Record<string, string> | null; created_at: string }) => ({
    id: u.id,
    email: u.email ?? "",
    name: u.raw_user_meta_data?.name ?? "",
    company_name: u.raw_user_meta_data?.company_name ?? "",
    employee_number: u.raw_user_meta_data?.employee_number ?? "",
    created_at: u.created_at,
  }));

  return NextResponse.json({ members });
}
