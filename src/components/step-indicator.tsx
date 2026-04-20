"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
  maxReachedStep: number;
  steps: string[];
  onStepClick?: (step: number) => void;
}

export function StepIndicator({ currentStep, maxReachedStep, steps, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < maxReachedStep;
        const isClickable = stepNum <= maxReachedStep && stepNum !== currentStep;

        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={cn(
                  "h-0.5 w-8",
                  stepNum <= maxReachedStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick?.(stepNum)}
              className={cn(
                "flex items-center gap-1.5",
                isClickable && "cursor-pointer hover:opacity-70"
              )}
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                  (isActive || isCompleted) && "bg-primary text-primary-foreground",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted && !isActive ? <Check className="size-3.5" /> : stepNum}
              </div>
              <span
                className={cn(
                  "text-sm",
                  isActive ? "font-display font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
