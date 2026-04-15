"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface Company {
  id: string;
  name: string;
}

const PASSWORD_RULES = [
  { label: "8자 이상", test: (pw: string) => pw.length >= 8 },
  { label: "영문 대문자 포함", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "영문 소문자 포함", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "숫자 포함", test: (pw: string) => /[0-9]/.test(pw) },
  { label: "특수문자 포함", test: (pw: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
];

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const meta = user?.user_metadata as
    | { name?: string; company_name?: string; company_id?: string; employee_number?: string }
    | undefined;

  // Profile form
  const [name, setName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (meta) {
      setName(meta.name ?? "");
      setEmployeeNumber(meta.employee_number ?? "");
      setCompanyId(meta.company_id ?? "");
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []))
      .catch(() => {});
  }, []);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    if (!name.trim()) {
      setProfileMsg({ type: "error", text: "이름을 입력해주세요." });
      return;
    }
    if (!employeeNumber.trim()) {
      setProfileMsg({ type: "error", text: "사번을 입력해주세요." });
      return;
    }
    if (!companyId) {
      setProfileMsg({ type: "error", text: "회사를 선택해주세요." });
      return;
    }

    setProfileSaving(true);
    const supabase = getSupabaseBrowser();
    const selectedCompany = companies.find((c) => c.id === companyId);

    const { error } = await supabase.auth.updateUser({
      data: {
        name: name.trim(),
        employee_number: employeeNumber.trim(),
        company_id: companyId,
        company_name: selectedCompany?.name ?? "",
      },
    });

    setProfileSaving(false);
    if (error) {
      setProfileMsg({ type: "error", text: "저장에 실패했습니다. 다시 시도해 주세요." });
    } else {
      setProfileMsg({ type: "success", text: "프로필이 저장되었습니다." });
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    for (const rule of PASSWORD_RULES) {
      if (!rule.test(newPassword)) {
        setPwMsg({ type: "error", text: rule.label + " 조건을 충족해야 합니다." });
        return;
      }
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "비밀번호가 일치하지 않습니다." });
      return;
    }

    setPwSaving(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setPwSaving(false);
    if (error) {
      setPwMsg({ type: "error", text: "비밀번호 변경에 실패했습니다. 다시 시도해 주세요." });
    } else {
      setPwMsg({ type: "success", text: "비밀번호가 변경되었습니다." });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const pwChecks = PASSWORD_RULES.map((rule) => ({
    label: rule.label,
    passed: rule.test(newPassword),
  }));
  const showPwChecks = newPassword.length > 0;

  if (isLoading || !user) {
    return null;
  }

  return (
    <div className="max-w-lg mx-auto py-10 px-4">
      <h1 className="text-lg font-semibold mb-6">내 프로필</h1>

      {/* Profile Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSave} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="profile-email" className="text-sm">이메일</Label>
              <Input
                id="profile-email"
                type="email"
                value={user.email ?? ""}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="profile-name" className="text-sm">이름</Label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="profile-employee" className="text-sm">사번</Label>
              <Input
                id="profile-employee"
                type="text"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="profile-company" className="text-sm">회사</Label>
              <select
                id="profile-company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">회사를 선택하세요</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {profileMsg && (
              <div className={`rounded-md px-3 py-2 border ${
                profileMsg.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}>
                <p className="text-sm">{profileMsg.text}</p>
              </div>
            )}

            <Button type="submit" disabled={profileSaving} className="w-full">
              {profileSaving ? "저장 중..." : "저장"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Password Change */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">비밀번호 변경</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-sm">새 비밀번호</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="새 비밀번호를 입력하세요"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {showPwChecks && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                  {pwChecks.map((c) => (
                    <span
                      key={c.label}
                      className={`text-[11px] ${c.passed ? "text-emerald-500" : "text-muted-foreground"}`}
                    >
                      {c.passed ? "\u2713" : "\u25CB"} {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-sm">새 비밀번호 확인</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="새 비밀번호를 다시 입력하세요"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            {pwMsg && (
              <div className={`rounded-md px-3 py-2 border ${
                pwMsg.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}>
                <p className="text-sm">{pwMsg.text}</p>
              </div>
            )}

            <Button type="submit" disabled={pwSaving} className="w-full">
              {pwSaving ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
