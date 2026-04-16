import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출 시 무시 (읽기 전용)
          }
        },
      },
    }
  );
}

/** API Route에서 사용 — 인증된 사용자 ID를 반환, 미인증 시 null */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** 해당 유저가 admin인지 확인 (career_evaluation.admins 테이블 조회) */
export async function isAdmin(userId: string): Promise<boolean> {
  const { getSupabase } = await import("@/lib/supabase");
  const { data } = await getSupabase()
    .from("admins")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
