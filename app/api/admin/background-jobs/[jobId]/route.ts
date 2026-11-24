import { NextRequest, NextResponse } from "next/server";
import { getRequestId } from "@/lib/api";
import { getOwnedBackgroundJob, requestBackgroundJobCancellation, serializeBackgroundJob } from "@/lib/server/background-jobs";
import { requireAdmin } from "@/lib/server/auth-session";
import { isSameOriginRequest } from "@/lib/server/same-origin";
import { backgroundJobIdSchema } from "@/schemas/background-job.schema";

export const runtime = "nodejs";
type Context = { params: Promise<{ jobId: string }> };

async function authorize(request: NextRequest, context: Context) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return { response: auth.response } as const;
  const parsed = backgroundJobIdSchema.safeParse((await context.params).jobId);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { success: false, message: "Mã job không hợp lệ.", requestId: getRequestId() },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  return { userId: auth.user.idTaiKhoan, jobId: parsed.data } as const;
}

export async function GET(request: NextRequest, context: Context) {
  const access = await authorize(request, context);
  if ("response" in access) return access.response;
  const job = await getOwnedBackgroundJob(access.jobId, access.userId);
  return NextResponse.json(
    job ? { success: true, job: serializeBackgroundJob(job) } : { success: false, message: "Không tìm thấy job." },
    { status: job ? 200 : 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest, context: Context) {
  const requestId = getRequestId();
  const access = await authorize(request, context);
  if ("response" in access) return access.response;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Origin không hợp lệ.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const job = await requestBackgroundJobCancellation(access.jobId, access.userId);
  return NextResponse.json(
    job ? { success: true, job: serializeBackgroundJob(job), requestId } : { success: false, message: "Không tìm thấy job.", requestId },
    { status: job ? 200 : 404, headers: { "Cache-Control": "no-store" } },
  );
}
