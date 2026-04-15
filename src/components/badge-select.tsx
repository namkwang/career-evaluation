"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BadgeOption {
  value: string;
  label: string;
  className: string;
}

interface BadgeSelectProps {
  value: string;
  options: BadgeOption[];
  onChange: (value: string) => void;
  edited?: boolean;
  editTooltip?: string;
}

export function BadgeSelect({ value, options, onChange, edited, editTooltip }: BadgeSelectProps) {
  const current = options.find(o => o.value === value);
  const badgeClass = current?.className ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <div>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger
          title={editTooltip}
          className={cn(
            "h-7 text-xs font-medium border rounded-md px-2 gap-1 w-auto min-w-[90px]",
            badgeClass,
            edited && "ring-2 ring-amber-400"
          )}
        >
          <SelectValue>{current?.label ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>
              <span className={cn("text-xs px-1.5 py-0.5 rounded border font-medium", o.className)}>
                {o.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// 회사유형 옵션
export const CATEGORY_OPTIONS: BadgeOption[] = [
  { value: "general_top100", label: "종합 100위", className: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "general_outside100", label: "종합 100위 외", className: "bg-sky-100 text-sky-800 border-sky-200" },
  { value: "specialty", label: "전문건설", className: "bg-green-100 text-green-800 border-green-200" },
  { value: "construction_related", label: "건설유관", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "other", label: "기타", className: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "military", label: "군복무", className: "bg-violet-100 text-violet-800 border-violet-200" },
  { value: "manual", label: "수기 입력", className: "bg-orange-100 text-orange-800 border-orange-200" },
];

// 고용형태 옵션
export const EMPLOYMENT_OPTIONS: BadgeOption[] = [
  { value: "regular", label: "정규직", className: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "contract", label: "비정규직", className: "bg-red-100 text-red-800 border-red-200" },
  { value: "unknown", label: "미확인", className: "bg-gray-100 text-gray-600 border-gray-200" },
];
