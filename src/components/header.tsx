"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function Header() {
  const { user, isLoading, isAdmin, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const meta = user?.user_metadata as
    | { name?: string; company_name?: string; employee_number?: string }
    | undefined;

  return (
    <header className="border-b bg-background shadow-[0_1px_0_0_rgba(34,42,53,0.04)]">
      <div className="max-w-[1600px] mx-auto px-6 h-12 flex items-center gap-6">
        <Link href="/" className="font-display font-semibold text-sm">
          경력산정 자동화
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/?reset=true" className="transition-colors hover:text-foreground">새 분석</Link>
          <Link href="/history" className="transition-colors hover:text-foreground">지원자 목록</Link>
          <Link href="/feedback" className="transition-colors hover:text-foreground">개선 요청</Link>
          {isAdmin && (
            <Link href="/admin/members" className="transition-colors hover:text-foreground">회원 관리</Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {!isLoading && user && (
            <>
              {(meta?.company_name || meta?.name) && (
                <span className="text-muted-foreground text-xs">
                  {meta?.company_name && (
                    <span className="font-medium text-foreground">{meta.company_name}</span>
                  )}
                  {meta?.company_name && meta?.name && " · "}
                  {meta?.name && <span>{meta.name}</span>}
                  {meta?.employee_number && (
                    <span className="text-muted-foreground/70"> ({meta.employee_number})</span>
                  )}
                </span>
              )}
              <Link href="/profile" className="transition-colors hover:text-foreground text-muted-foreground">
                내 프로필
              </Link>
              <button
                onClick={handleSignOut}
                className="transition-colors hover:text-foreground text-muted-foreground"
              >
                로그아웃
              </button>
            </>
          )}
          {!isLoading && !user && (
            <Link href="/login" className="transition-colors hover:text-foreground text-muted-foreground">
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
