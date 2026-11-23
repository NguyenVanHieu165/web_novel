import { NextRequest, NextResponse } from "next/server";
import { getRequestId } from "@/lib/api";
import { requireAdmin } from "@/lib/server/auth-session";
import { runCheckpointDatabaseDiagnostic } from "@/lib/server/system-log";

export const runtime = "nodejs";

function invalidOrigin(request: NextRequest) {
  return request.headers.get("sec-fetch-site") === "cross-site" ||
    Boolean(request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const requestId = getRequestId();
  if (invalidOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Origin không hợp lệ.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await runCheckpointDatabaseDiagnostic(auth.user.idTaiKhoan, requestId);
  return NextResponse.json(
    {
      success: result.ok,
      message: result.ok
        ? "Database có đủ quyền và hỗ trợ JSON cho checkpoint."
        : `Kiểm tra thất bại tại bước ${result.failedStep}. Xem nhật ký theo mã yêu cầu.`,
      requestId,
      result,
    },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
