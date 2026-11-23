import * as React from "react"

import { cn } from "@/lib/utils"

function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-content"
      className={cn("min-w-0 space-y-1.5", className)}
      {...props}
    />
  )
}

function PageHeaderEyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-eyebrow"
      className={cn(
        "text-xs font-semibold tracking-wider text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}

function PageHeaderTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn("text-balance text-2xl font-bold tracking-tight sm:text-3xl", className)}
      {...props}
    />
  )
}

function PageHeaderDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn("max-w-2xl text-pretty text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function PageHeaderActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
}
