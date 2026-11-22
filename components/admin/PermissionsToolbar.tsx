"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PermissionTab } from "@/schemas/admin-roles.schema";
import { permissionsHref, type PermissionFilters } from "./permissions-url";

const tabs: { id: PermissionTab; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "admin", label: "Quản trị viên" },
  { id: "author", label: "Tác giả" },
  { id: "basic", label: "Độc giả / Chưa phân quyền" },
];

export function PermissionsToolbar({ term, tab, roleId }: PermissionFilters) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(term);
  const [previousTerm, setPreviousTerm] = useState(term);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (previousTerm !== term) {
    setPreviousTerm(term);
    if (draft === previousTerm) setDraft(term);
  }

  useEffect(() => {
    function restoreSearch() {
      clearTimeout(timer.current);
      setDraft(new URLSearchParams(window.location.search).get("q") ?? "");
    }
    window.addEventListener("popstate", restoreSearch);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("popstate", restoreSearch);
    };
  }, []);

  function search(value: string) {
    clearTimeout(timer.current);
    startTransition(() => router.replace(permissionsHref({ term: value, tab, roleId }), { scroll: false }));
  }

  return (
    <div className="space-y-3 px-3 pt-4 pb-3 sm:px-4">
      <form role="search" action="/admin/permissions" className="relative max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          search(draft);
        }}>
        {roleId ? <input type="hidden" name="role" value={roleId} /> : null}
        {!roleId && tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input} name="q" value={draft} maxLength={100} autoComplete="off" spellCheck={false}
          aria-label="Tìm theo tên hoặc email" placeholder="Tìm theo tên hoặc email…"
          className="h-10 bg-background pr-11 pl-9"
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => search(value), 300);
          }}
        />
        {draft ? (
          <Button
            type="button" variant="ghost" size="icon" aria-label="Xóa từ khóa tìm kiếm"
            className="absolute top-0.5 right-0.5 size-9 touch-manipulation"
            onClick={() => {
              setDraft("");
              search("");
              input.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </form>
      <nav aria-label="Lọc nhanh theo vai trò" className="flex flex-wrap items-center gap-1">
        {tabs.map(({ id, label }) => {
          const active = !roleId && tab === id;
          return (
            <Link
              key={id} href={permissionsHref({ term: draft, tab: id })} scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 touch-manipulation items-center rounded-lg px-3 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) clearTimeout(timer.current);
              }}
            >
              {label}
            </Link>
          );
        })}
        {isPending ? <span role="status" className="text-xs text-muted-foreground">Đang lọc…</span> : null}
      </nav>
    </div>
  );
}
