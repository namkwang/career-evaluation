import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null;

/** Server-side Supabase client with career_eva schema (lazy-initialized) */
export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { db: { schema: "career_eva" } }
    );
  }
  return _supabase;
}

export const STORAGE_BUCKET = "career-documents";
