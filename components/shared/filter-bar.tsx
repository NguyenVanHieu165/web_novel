import * as React from "react"

import { cn } from "@/lib/utils"

function FilterBar({
  className,
  "aria-label": ariaLabel = "Bộ lọc",
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      aria-label={ariaLabel}
      data-slot="filter-bar"
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-sm sm:flex-row sm:items-end sm:justify-between",
        className
      )}
      {...props}
    />
  )
}

function FilterBarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar-group"
      className={cn("flex min-w-0 flex-1 flex-wrap items-end gap-3", className)}
      {...props}
    />
  )
}

function FilterBarActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar-actions"
      className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { FilterBar, FilterBarActions, FilterBarGroup }
