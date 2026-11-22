import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

export function AccountField({
  id, label, hint, error, ...props
}: ComponentProps<typeof Input> & { id: string; label: string; hint?: string; error?: string }) {
  const descriptions = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <Input
        {...props}
        id={id}
        className="h-11 border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
        aria-invalid={Boolean(error)}
        aria-describedby={descriptions || undefined}
      />
      {hint && <p id={`${id}-hint`} className="text-sm text-slate-600 dark:text-zinc-400">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function AccountFormStatus({ error, message }: { error?: string; message?: string }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
    </div>
  );
}
