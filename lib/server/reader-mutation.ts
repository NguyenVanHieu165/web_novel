import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { requireUser } from "@/lib/server/auth-session";

export function readerMutationError(message: string, status: number, field?: string) {
  return NextResponse.json({ success: false, message, field }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function readerMutationSuccess(message: string) {
  return NextResponse.json({ success: true, message }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function runReaderMutation<T>(
  request: NextRequest,
  schema: ZodType<T>,
  operation: (accountId: number, input: T) => Promise<NextResponse>,
) {
  const origin = request.headers.get("origin");
  // NextURL normalizes loopback hosts and can use the server's bind address.
  const host = request.headers.get("host");
  const requestOrigin = host ? `${request.nextUrl.protocol}//${host.toLowerCase()}` : request.nextUrl.origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin !== null && origin !== requestOrigin)) {
    return readerMutationError("Yêu cầu không hợp lệ. Hãy tải lại trang và thử lại.", 403);
  }

  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return readerMutationError("Dữ liệu gửi lên không hợp lệ.", 415);
  }

  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;

    const body = schema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      const issue = body.error.issues[0];
      const field = issue?.path[0];
      return readerMutationError(issue?.message ?? "Kiểm tra lại thông tin đã nhập.", 400,
        typeof field === "string" ? field : undefined);
    }

    return await operation(auth.user.idTaiKhoan, body.data);
  } catch (error) {
    // Prisma diagnostics can include submitted field values. Record the code only.
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    console.error("Reader account mutation failed", typeof code === "string" ? code : "UNKNOWN");
    return readerMutationError("Không thể lưu thay đổi. Vui lòng thử lại.", 500);
  }
}
