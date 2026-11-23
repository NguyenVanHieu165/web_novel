import * as React from "react"
import type { VariantProps } from "class-variance-authority"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { Slot } from "radix-ui"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="Phân trang"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = React.ComponentProps<"a"> &
  Pick<VariantProps<typeof buttonVariants>, "size"> & {
    asChild?: boolean
    isActive?: boolean
  }

function PaginationLink({
  className,
  asChild = false,
  isActive = false,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
        "aria-disabled:pointer-events-none aria-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({ className, ...props }: PaginationLinkProps) {
  return (
    <PaginationLink
      aria-label="Đến trang trước"
      size="default"
      className={cn("gap-1 px-2.5 sm:pl-2", className)}
      {...props}
    >
      <ChevronLeftIcon aria-hidden="true" />
      <span>Trước</span>
    </PaginationLink>
  )
}

function PaginationNext({ className, ...props }: PaginationLinkProps) {
  return (
    <PaginationLink
      aria-label="Đến trang sau"
      size="default"
      className={cn("gap-1 px-2.5 sm:pr-2", className)}
      {...props}
    >
      <span>Sau</span>
      <ChevronRightIcon aria-hidden="true" />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon aria-hidden="true" className="size-4" />
      <span className="sr-only">Thêm trang</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
