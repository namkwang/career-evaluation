"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Company {
  id: string;
  name: string;
}

export default function ProfilePage() {
  const { user, isLoading, isAdmin } = useAuth();
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

  if (isLoading || !user) {
    return null;
  }

  return (
    <div className="max-w-lg mx-auto py-10 px-4">
      <h1 className="text-lg font-semibold mb-6">내 프로필</h1>

      {/* Profile Info */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center gap-2">
          <CardTitle className="text-base">기본 정보</CardTitle>
          {isAdmin && (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
              관리자
            </span>
          )}
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
              <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
                <SelectTrigger id="profile-company" className="w-full">
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

    </div>
  );
}
