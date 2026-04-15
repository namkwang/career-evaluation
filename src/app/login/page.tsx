"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowser();

    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (authError) throw authError;
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "message" in err) {
        const message = (err as { message: string }).message;
        if (message.includes("Invalid login credentials")) {
          setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        } else if (message.includes("User already registered")) {
          setError("이미 등록된 이메일입니다.");
        } else if (message.includes("Email not confirmed")) {
          setError("이메일 인증이 필요합니다. 메일함을 확인해 주세요.");
        } else {
          setError("오류가 발생했습니다. 다시 시도해 주세요.");
        }
      } else {
        setError("오류가 발생했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">경력산정 자동화</h1>
          <p className="mt-1 text-xs text-muted-foreground">건설 경력 자동 산정 시스템</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 pb-2 text-sm font-medium transition-colors ${
                  mode === "login"
                    ? "text-foreground border-b-2 border-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 pb-2 text-sm font-medium transition-colors ${
                  mode === "signup"
                    ? "text-foreground border-b-2 border-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                회원가입
              </button>
            </div>
            <CardTitle className="text-base pt-3">
              {mode === "login" ? "계정에 로그인" : "새 계정 만들기"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-sm">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="이메일을 입력하세요"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-sm">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호 (최소 6자)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>

              {mode === "signup" && (
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword" className="text-sm">비밀번호 확인</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
              )}

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading
                  ? mode === "login" ? "로그인 중..." : "가입 중..."
                  : mode === "login" ? "로그인" : "회원가입"}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {mode === "login" ? (
                <>계정이 없으신가요?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className="text-foreground hover:underline font-medium">
                    회원가입
                  </button>
                </>
              ) : (
                <>이미 계정이 있으신가요?{" "}
                  <button type="button" onClick={() => switchMode("login")} className="text-foreground hover:underline font-medium">
                    로그인
                  </button>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
