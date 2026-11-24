import { NextRequest, NextResponse } from "next/server";
import { getRequestId } from "@/lib/api";
import { importErrorCode, importErrorMessage } from "@/lib/scraper/errors";
import { terminal } from "@/lib/scraper/types";
import { wakeBackgroundWorker } from "@/lib/server/background-jobs";
import { requireAdmin } from "@/lib/server/auth-session";
import {
  getOwnedImportNovelJob,
  requestImportNovelCancellation,
  resumeImportNovelJob,
  serializeImportNovelJob,
} from "@/lib/server/import-novel-jobs";
import { revalidatePublicStories } from "@/lib/server/public-cache";
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
        { message: "Mã phiên không hợp lệ.", requestId: getRequestId() },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }
  return { userId: auth.user.idTaiKhoan, jobId: parsed.data } as const;
}

function missing(requestId: string) {
  return NextResponse.json(
    { message: "Không tìm thấy phiên import. Có thể nhập lại URL và bỏ qua chương đã tồn tại.", requestId },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function failure(error: unknown, requestId: string) {
  const code = importErrorCode(error);
  return NextResponse.json(
    { message: importErrorMessage(error), code, requestId },
    {
      status: ["JOB_BUSY", "RATE_LIMITED"].includes(code) ? 409 : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: NextRequest, context: Context) {
  const requestId = getRequestId();
  const access = await authorize(request, context);
  if ("response" in access) return access.response;
  try {
    const job = await getOwnedImportNovelJob(access.jobId, access.userId);
    if (!job) return missing(requestId);
    const state = serializeImportNovelJob(job);
    if (terminal(state.status)) revalidatePublicStories(undefined, true);
    return NextResponse.json(state, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const requestId = getRequestId();
  const access = await authorize(request, context);
  if ("response" in access) return access.response;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Origin không hợp lệ.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const job = await requestImportNovelCancellation(access.jobId, access.userId);
    return job
      ? NextResponse.json(serializeImportNovelJob(job), { status: 200, headers: { "Cache-Control": "no-store" } })
      : missing(requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

// Keep the existing Admin recovery control, but enqueue a new durable job
// with skipExisting enabled instead of resuming execution inside Vercel.
export async function POST(request: NextRequest, context: Context) {
  const requestId = getRequestId();
  const access = await authorize(request, context);
  if ("response" in access) return access.response;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Origin không hợp lệ.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const resumed = await resumeImportNovelJob(access.jobId, access.userId, requestId);
    if (!resumed) return missing(requestId);
    await wakeBackgroundWorker(resumed.job.id);
    return NextResponse.json(
      { jobId: resumed.job.id, requestId },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, requestId);
  }
}
