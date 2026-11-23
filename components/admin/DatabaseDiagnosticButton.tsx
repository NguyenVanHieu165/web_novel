"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type DiagnosticResponse = {
  success: boolean;
  message: string;
  requestId: string;
  result?: { ok: boolean; failedStep?: string };
};

export function DatabaseDiagnosticButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function runDiagnostic() {
    setRunning(true);
    try {
      const response = await fetch("/api/admin/system-logs/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await response.json() as DiagnosticResponse;
      if (!response.ok || !body.success) {
        toast.error(body.message || "Không thể kiểm tra database.", {
          description: body.requestId ? `Mã yêu cầu: ${body.requestId}` : undefined,
        });
        return;
      }
      toast.success(body.message, { description: `Mã yêu cầu: ${body.requestId}` });
      router.refresh();
    } catch {
      toast.error("Mất kết nối khi kiểm tra database. Hãy thử lại.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button type="button" onClick={runDiagnostic} disabled={running}>
      {running
        ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        : <Activity aria-hidden="true" className="size-4" />}
      {running ? "Đang kiểm tra…" : "Kiểm tra quyền checkpoint"}
    </Button>
  );
}
