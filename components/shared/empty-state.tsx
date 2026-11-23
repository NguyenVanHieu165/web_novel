import * as React from "react"

import { cn } from "@/lib/utils"

function EmptyState({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-10 text-center",
        className
      )}
      {...props}
    />
  )
}

function EmptyStateIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="empty-state-icon"
      className={cn(
        "mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&>svg]:size-5",
        className
      )}
      {...props}
    />
  )
}

function EmptyStateTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="empty-state-title"
      className={cn("text-balance font-semibold", className)}
      {...props}
    />
  )
}

function EmptyStateDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-state-description"
      className={cn("mt-1 max-w-md text-pretty text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function EmptyStateActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-state-actions"
      className={cn("mt-5 flex flex-wrap items-center justify-center gap-2", className)}
      {...props}
    />
  )
}

export {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
}
