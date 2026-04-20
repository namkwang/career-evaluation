"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Mode = "login" | "signup";

interface Company {
  id: string;
  name: string;
}

interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordCheck[] = [
  { label: "8자 이상", test: (pw) => pw.length >= 8 },
  { label: "영문 대문자 포함", test: (pw) => /[A-Z]/.test(pw) },
  { label: "영문 소문자 포함", test: (pw) => /[a-z]/.test(pw) },
  { label: "숫자 포함", test: (pw) => /[0-9]/.test(pw) },
  { label: "특수문자 포함", test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
];

function validatePassword(pw: string): string | null {
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(pw)) return rule.label + " 조건을 충족해야 합니다.";
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      const pwError = validatePassword(password);
      if (pwError) {
        setError(pwError);
        return;
      }
      if (password !== confirmPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
      if (!name.trim()) {
        setError("이름을 입력해주세요.");
        return;
      }
      if (!employeeNumber.trim()) {
        setError("사번을 입력해주세요.");
        return;
      }
      if (!companyId) {
        setError("회사를 선택해주세요.");
        return;
      }
    }

    setLoading(true);
    const supabase = getSupabaseBrowser();
    const selectedCompany = companies.find((c) => c.id === companyId);

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
          options: {
            data: {
              name: name.trim(),
              employee_number: employeeNumber.trim(),
              company_id: companyId,
              company_name: selectedCompany?.name ?? "",
            },
          },
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

  const pwChecks = PASSWORD_RULES.map((rule) => ({
    label: rule.label,
    passed: rule.test(password),
  }));
  const showPwChecks = mode === "signup" && password.length > 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-display text-foreground">경력산정 자동화</h1>
          <p className="mt-1 text-xs text-muted-foreground">건설 경력 자동 산정 시스템</p>
        </div>

        <Card className="shadow-md">
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
              {mode === "signup" && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="name" className="text-sm">이름</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="홍길동"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="employeeNumber" className="text-sm">사번</Label>
                    <Input
                      id="employeeNumber"
                      type="text"
                      placeholder="사번을 입력하세요"
                      value={employeeNumber}
                      onChange={(e) => setEmployeeNumber(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="company" className="text-sm">회사</Label>
                    <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")} required>
                      <SelectTrigger id="company" className="w-full">
                        <SelectValue placeholder="회사를 선택하세요">
                          {companies.find((c) => c.id === companyId)?.name ?? ""}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

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
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                {showPwChecks && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                    {pwChecks.map((c) => (
                      <span
                        key={c.label}
                        className={`text-[11px] ${c.passed ? "text-[var(--success)]" : "text-muted-foreground"}`}
                      >
                        {c.passed ? "✓" : "○"} {c.label}
                      </span>
                    ))}
                  </div>
                )}
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
