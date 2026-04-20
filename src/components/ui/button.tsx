import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg cursor-pointer font-medium transition-[background,border,color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[2px] focus-visible:ring-ring/40 focus-visible:ring-offset-[2px] focus-visible:ring-offset-background aria-invalid:ring-destructive/30 aria-invalid:border-destructive active:opacity-90",
  {
    variants: {
      variant: {
        default:
          "bg-primary border border-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-primary/90 hover:border-primary/90",
        secondary: "bg-secondary border border-secondary text-secondary-foreground hover:bg-accent hover:border-accent",
        outline:
          "bg-card border border-border text-foreground shadow-[0_0_0_1px_rgba(34,42,53,0.06),0_1px_2px_0_rgba(34,42,53,0.05)] hover:bg-secondary hover:border-border",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "text-info underline-offset-4 hover:underline",
        destructive:
          "bg-destructive border border-destructive text-destructive-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] hover:bg-destructive/90 hover:border-destructive/90 focus-visible:ring-destructive/30",
      },
      size: {
        sm: "h-9 px-3 py-2 text-sm has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4",
        default: "h-10 px-4 py-2 text-sm has-[>svg]:px-3.5",
        lg: "h-11 px-5 py-2.5 text-base has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-5",
        xl: "h-12 px-6 py-3 text-base has-[>svg]:px-5 [&_svg:not([class*='size-'])]:size-5",
        xs: "h-7 gap-1 rounded-md px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-10",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
