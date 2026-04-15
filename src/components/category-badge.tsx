"use client";

import { cn } from "@/lib/utils";

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  general_top100: { label: "종합 100위", className: "bg-blue-100 text-blue-800 border-blue-200" },
  general_outside100: { label: "종합 100위 외", className: "bg-sky-100 text-sky-800 border-sky-200" },
  specialty: { label: "전문건설", className: "bg-green-100 text-green-800 border-green-200" },
  construction_related: { label: "건설유관", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  other: { label: "기타", className: "bg-gray-100 text-gray-700 border-gray-200" },
  military: { label: "군복무", className: "bg-violet-100 text-violet-800 border-violet-200" },
};

export function CategoryBadge({
  category,
  rankingYear,
  rankingPosition,
}: {
  category: string;
  rankingYear?: number | null;
  rankingPosition?: number | null;
}) {
  const c = CATEGORY_CONFIG[category] ?? { label: category, className: "bg-gray-100 text-gray-700 border-gray-200" };

  const tooltip =
    rankingYear && rankingPosition
      ? `${rankingYear}년 시공능력평가 ${rankingPosition}위`
      : undefined;

  return (
    <span
      className={cn("text-xs px-1.5 py-0.5 rounded border font-medium cursor-default", c.className)}
      title={tooltip}
    >
      {c.label}
    </span>
  );
}
