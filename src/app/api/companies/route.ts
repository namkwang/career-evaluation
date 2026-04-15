import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getCommonSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "common" } }
  );
}

export async function GET() {
  const { data, error } = await getCommonSupabase()
    .from("companies")
    .select("id, name")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companies: data ?? [] });
}
