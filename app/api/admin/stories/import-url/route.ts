import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { importUrlSchema } from "@/lib/scraper/types";
import { publicTarget } from "@/lib/scraper/network";
import { createJob, runJob } from "@/lib/scraper/job-manager";
import { importErrorCode, importErrorMessage } from "@/lib/scraper/errors";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { getRequestId } from "@/lib/api";
import { writeSystemLog } from "@/lib/server/system-log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = getRequestId();
  try {
    const auth = await requireAdmin(req);
    if (!auth.authorized) return auth.response;
    if (req.headers.get("sec-fetch-site") === "cross-site" || (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin)) {
      return NextResponse.json({ message: "Origin không hợp lệ.", requestId }, { status: 403 });
    }
    const input = importUrlSchema.safeParse(await req.json().catch(() => null));
    if (!input.success) return NextResponse.json({ message: "URL hoặc tùy chọn import không hợp lệ.", requestId }, { status: 400 });
    try { await publicTarget(input.data.url); }
    catch (error) {
      return NextResponse.json({ message: importErrorMessage(error), code: importErrorCode(error), requestId }, { status: 400 });
    }
    const context = { requestId, writeLog: writeSystemLog };
    const jobId = await createJob(auth.user.idTaiKhoan, input.data, undefined, context);
    after(async () => {
      try { await runJob(jobId); }
      catch (error) { console.error("Import background job failed", importErrorCode(error)); throw error; }
      finally { revalidatePublicStories(undefined, true); }
    });
    return NextResponse.json({ jobId, requestId }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = importErrorCode(error);
    return NextResponse.json({ message: importErrorMessage(error), code, requestId }, {
      status: ["JOB_BUSY", "RATE_LIMITED"].includes(code) ? 409 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
