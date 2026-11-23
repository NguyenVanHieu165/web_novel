import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

export function AccountField({
  id, label, hint, error, ...props
}: ComponentProps<typeof Input> & { id: string; label: string; hint?: string; error?: string }) {
  const descriptions = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        {...props}
        id={id}
        className="h-11 bg-background"
        aria-invalid={Boolean(error)}
        aria-describedby={descriptions || undefined}
      />
      {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function AccountFormStatus({ error, message }: { error?: string; message?: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="space-y-2">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {message && <Alert variant="success"><AlertDescription>{message}</AlertDescription></Alert>}
    </div>
  );
}
