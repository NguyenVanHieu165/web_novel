import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { importUrlSchema } from "@/lib/scraper/types";
import { publicTarget } from "@/lib/scraper/network";
import { createJob, runJob } from "@/lib/scraper/job-manager";
import { importErrorCode, importErrorMessage } from "@/lib/scraper/errors";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req); if (!auth.authorized) return auth.response;
  if (req.headers.get("sec-fetch-site") === "cross-site" || (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin)) return NextResponse.json({ message: "Origin không hợp lệ." }, { status: 403 });
  const input = importUrlSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ message: "URL hoặc tùy chọn import không hợp lệ." }, { status: 400 });
  try { await publicTarget(input.data.url); } catch { return NextResponse.json({ message: "URL phải trỏ tới website công khai, không được dùng localhost/IP nội bộ." }, { status: 400 }); }
  try {
    const jobId = await createJob(auth.user.idTaiKhoan, input.data);
    after(() => runJob(jobId));
    return NextResponse.json({ jobId }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { const code = importErrorCode(error); return NextResponse.json({ message: importErrorMessage(error), code }, { status: ["JOB_BUSY", "RATE_LIMITED"].includes(code) ? 409 : 500 }); }
}
