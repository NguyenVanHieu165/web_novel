import * as React from "react"

import { cn } from "@/lib/utils"

function FormActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

export { FormActions }
