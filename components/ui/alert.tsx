import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[1rem_1fr] [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive",
        success: "border-success/30 bg-success/10 text-success dark:text-success",
        warning: "border-warning/35 bg-warning/15 text-warning-foreground dark:text-warning",
        info: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 font-semibold leading-none", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 text-current/85 [&_p]:leading-relaxed [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle, alertVariants }
