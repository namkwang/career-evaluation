"use client";

import { Badge } from "@/components/ui/badge";

export function EmploymentBadge({
  type,
  reason,
}: {
  type: string;
  reason?: string | null;
}) {
  const variant =
    type === "regular"
      ? "default"
      : type === "contract"
        ? "destructive"
        : "secondary";
  const label =
    type === "regular"
      ? "정규직"
      : type === "contract"
        ? "비정규직"
        : "미확인";

  return (
    <Badge variant={variant} className="cursor-default" title={reason ?? undefined}>
      {label}
    </Badge>
  );
}
