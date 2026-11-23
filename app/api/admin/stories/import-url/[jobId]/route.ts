import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth-session";
import { cancelJob, getJob, resumeJob, runJob } from "@/lib/scraper/job-manager";
import { importErrorCode, importErrorMessage } from "@/lib/scraper/errors";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { getRequestId } from "@/lib/api";
import { writeSystemLog } from "@/lib/server/system-log";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ jobId: string }> };
function invalidOrigin(req: NextRequest) {
  return req.headers.get("sec-fetch-site") === "cross-site" || !!req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin;
}
async function handle(req: NextRequest, context: Context, cancel: boolean) {
  const requestId = getRequestId();
  const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
  if (cancel && invalidOrigin(req)) return NextResponse.json({ message: "Origin không hợp lệ.", requestId }, { status: 403 });
  const parsed = z.string().uuid().safeParse((await context.params).jobId);
  try {
    const logContext = { requestId, writeLog: writeSystemLog };
    const state = parsed.success ? await (cancel ? cancelJob : getJob)(parsed.data, auth.user.idTaiKhoan, logContext) : null;
    return NextResponse.json(state || { message: "Không tìm thấy phiên import. Có thể nhập lại URL và bỏ qua chương đã tồn tại.", requestId }, { status: state ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ message: importErrorMessage(error), code: importErrorCode(error), requestId }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
export async function GET(req: NextRequest, context: Context) { return handle(req, context, false); }
export async function DELETE(req: NextRequest, context: Context) { return handle(req, context, true); }
export async function POST(req: NextRequest, context: Context) {
  const requestId = getRequestId();
  const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
  if (invalidOrigin(req)) return NextResponse.json({ message: "Origin không hợp lệ.", requestId }, { status: 403 });
  const parsed = z.string().uuid().safeParse((await context.params).jobId);
  if (!parsed.success) return NextResponse.json({ message: "Mã phiên không hợp lệ.", requestId }, { status: 400 });
  try {
    const jobId = await resumeJob(parsed.data, auth.user.idTaiKhoan, { requestId, writeLog: writeSystemLog });
    if (!jobId) return NextResponse.json({ message: "Không tìm thấy phiên import của bạn.", requestId }, { status: 404 });
    after(async () => {
      try { await runJob(jobId); }
      catch (error) { console.error("Import background job failed", importErrorCode(error)); throw error; }
      finally { revalidatePublicStories(undefined, true); }
    });
    return NextResponse.json({ jobId, requestId }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { const code = importErrorCode(error); return NextResponse.json({ message: importErrorMessage(error), code, requestId }, { status: ["JOB_BUSY", "RATE_LIMITED"].includes(code) ? 409 : 500 }); }
}
