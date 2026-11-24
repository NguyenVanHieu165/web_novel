import { NextRequest, NextResponse } from "next/server";
import { getRequestId } from "@/lib/api";
import { importErrorCode, importErrorMessage } from "@/lib/scraper/errors";
import { publicTarget } from "@/lib/scraper/network";
import { importUrlSchema } from "@/lib/scraper/types";
import { wakeBackgroundWorker } from "@/lib/server/background-jobs";
import { requireAdmin } from "@/lib/server/auth-session";
import { enqueueImportNovelJob } from "@/lib/server/import-novel-jobs";
import { isSameOriginRequest } from "@/lib/server/same-origin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = getRequestId();
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Origin không hợp lệ.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const input = importUrlSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { message: "URL hoặc tùy chọn import không hợp lệ.", requestId },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await publicTarget(input.data.url);
  } catch (error) {
    return NextResponse.json(
      { message: importErrorMessage(error), code: importErrorCode(error), requestId },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { job } = await enqueueImportNovelJob(auth.user.idTaiKhoan, input.data, requestId);
    await wakeBackgroundWorker(job.id);
    return NextResponse.json(
      { jobId: job.id, requestId },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = importErrorCode(error);
    console.error("[import-job-enqueue-failed]", { code, requestId });
    return NextResponse.json(
      { message: importErrorMessage(error), code, requestId },
      {
        status: ["JOB_BUSY", "RATE_LIMITED"].includes(code) ? 409 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
