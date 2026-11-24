import { NextRequest, NextResponse } from "next/server";
import { getRequestId } from "@/lib/api";
import { enqueueBackgroundJob, serializeBackgroundJob, wakeBackgroundWorker } from "@/lib/server/background-jobs";
import { requireAdmin } from "@/lib/server/auth-session";
import { isSameOriginRequest } from "@/lib/server/same-origin";
import { backgroundJobDiagnosticSchema } from "@/schemas/background-job.schema";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = getRequestId();
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Origin không hợp lệ.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const input = backgroundJobDiagnosticSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) {
    return NextResponse.json(
      { success: false, message: "Payload kiểm tra worker không hợp lệ.", requestId },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { dedupeKey, ...payload } = input.data;
    const result = await enqueueBackgroundJob({
      type: "system.noop",
      payload,
      ownerId: auth.user.idTaiKhoan,
      dedupeKey,
      maxAttempts: 3,
    });
    const wakeRequested = await wakeBackgroundWorker(result.job.id);
    return NextResponse.json(
      { success: true, created: result.created, wakeRequested, job: serializeBackgroundJob(result.job), requestId },
      { status: result.created ? 202 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[background-job-diagnostic-enqueue-failed]", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { success: false, message: "Chưa thể tạo job kiểm tra.", requestId },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
