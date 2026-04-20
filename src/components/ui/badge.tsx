import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border-transparent font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none gap-1 focus-visible:ring-[2px] focus-visible:ring-ring/40 transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        brand: "bg-info-muted text-info-muted-foreground shadow-[0_0_0_1px_var(--info-border)]",
        gray: "bg-secondary text-foreground shadow-[0_0_0_1px_rgba(34,42,53,0.08)]",
        error: "bg-destructive-muted text-destructive-muted-foreground shadow-[0_0_0_1px_var(--destructive-border)]",
        warning: "bg-warning-muted text-warning-muted-foreground shadow-[0_0_0_1px_var(--warning-border)]",
        success: "bg-success-muted text-success-muted-foreground shadow-[0_0_0_1px_var(--success-border)]",
        blue: "bg-info-muted text-info-muted-foreground shadow-[0_0_0_1px_var(--info-border)]",
        sky: "bg-info-muted text-info-muted-foreground shadow-[0_0_0_1px_var(--info-border)]",
        slate: "bg-secondary text-muted-foreground shadow-[0_0_0_1px_rgba(34,42,53,0.08)]",
        orange: "bg-orange-muted text-orange-muted-foreground shadow-[0_0_0_1px_var(--orange-border)]",
        default: "bg-secondary text-foreground shadow-[0_0_0_1px_rgba(34,42,53,0.08)]",
        secondary: "bg-secondary text-muted-foreground shadow-[0_0_0_1px_rgba(34,42,53,0.06)]",
        destructive:
          "bg-destructive-muted text-destructive-muted-foreground shadow-[0_0_0_1px_var(--destructive-border)]",
        outline: "border border-border bg-transparent text-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-xs [&>svg]:size-3",
        md: "px-2.5 py-0.5 text-sm [&>svg]:size-3.5",
        lg: "px-3 py-1 text-sm [&>svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "sm",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
