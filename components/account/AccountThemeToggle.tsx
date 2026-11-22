"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AccountThemeToggle({ compact = false }: { compact?: boolean }) {
  const { setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      className={compact
        ? "size-11 rounded-full text-slate-700 transition-colors hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        : "min-h-11 px-3 transition-colors"}
      title={compact ? "Đổi giao diện sáng hoặc tối" : undefined}
      onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")}>
      {compact && <Moon className="size-5 dark:hidden" aria-hidden="true" />}
      {compact && <Sun className="hidden size-5 dark:block" aria-hidden="true" />}
      <span className={compact ? "sr-only dark:hidden" : "dark:hidden"}>Bật giao diện tối</span>
      <span className={compact ? "sr-only hidden dark:inline" : "hidden dark:inline"}>Bật giao diện sáng</span>
    </Button>
  );
}
