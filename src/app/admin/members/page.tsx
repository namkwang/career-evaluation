"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Member {
  id: string;
  email: string;
  name: string;
  company_name: string;
  employee_number: string;
  created_at: string;
}

export default function AdminMembersPage() {
  const { user, isLoading, isAdmin } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.push("/");
    }
  }, [isLoading, user, isAdmin, router]);

  useEffect(() => {
    if (!isLoading && user && isAdmin) {
      fetch("/api/admin/members")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch");
          return res.json();
        })
        .then((data) => setMembers(data.members ?? []))
        .catch(() => setError("회원 목록을 불러오는데 실패했습니다."))
        .finally(() => setLoading(false));
    }
  }, [isLoading, user, isAdmin]);

  if (isLoading || !user || !isAdmin) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-display mb-6">회원 관리</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            전체 회원 목록
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({members.length}명)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 회원이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">이름</th>
                    <th className="pb-2 pr-4 font-medium">이메일</th>
                    <th className="pb-2 pr-4 font-medium">회사</th>
                    <th className="pb-2 pr-4 font-medium">사번</th>
                    <th className="pb-2 font-medium">가입일</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">{m.name || "-"}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{m.email}</td>
                      <td className="py-2.5 pr-4">{m.company_name || "-"}</td>
                      <td className="py-2.5 pr-4">{m.employee_number || "-"}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString("ko-KR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
