import * as React from "react"
import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

function ErrorState({ className, children, ...props }: React.ComponentProps<typeof Alert>) {
  return (
    <Alert
      role="alert"
      variant="destructive"
      data-slot="error-state"
      className={cn("items-start", className)}
      {...props}
    >
      <CircleAlertIcon aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </Alert>
  )
}

function ErrorStateTitle({ className, ...props }: React.ComponentProps<typeof AlertTitle>) {
  return <AlertTitle className={cn("text-balance", className)} {...props} />
}

function ErrorStateDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDescription>) {
  return <AlertDescription className={cn("mt-1 text-pretty", className)} {...props} />
}

function ErrorStateActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="error-state-actions"
      className={cn("mt-3 flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { ErrorState, ErrorStateActions, ErrorStateDescription, ErrorStateTitle }
