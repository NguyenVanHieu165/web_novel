import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { requireUser, type AuthenticatedUser } from "@/lib/server/auth-session";
import { StudioAccessError } from "@/lib/server/studio-ownership";
import { readWritingJson } from "@/lib/server/chapter-document-http";
import { ChapterDocumentError } from "@/lib/chapter-document-parser";

export function studioSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function studioError(error: unknown) {
  if (error instanceof StudioAccessError || error instanceof ChapterDocumentError) return NextResponse.json({ success: false, message: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Dữ liệu không hợp lệ.", errors: error.issues }, { status: 400 });
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (code === "P2002") return NextResponse.json({ success: false, code: "CONFLICT", message: "Số chương hoặc slug đã tồn tại. Kiểm tra lại trước khi lưu." }, { status: 409 });
  if (code === "P2034") return NextResponse.json({ success: false, code: "CONFLICT", message: "Dữ liệu vừa thay đổi. Vui lòng thử lưu lại." }, { status: 409 });
  console.error("Studio operation failed", typeof code === "string" ? code : "UNKNOWN");
  return NextResponse.json({ success: false, code: "STUDIO_ERROR", message: "Không thể thực hiện yêu cầu. Vui lòng thử lại." }, { status: 500 });
}

export function studioId(value: string) {
  return z.coerce.number().int().positive().max(2147483647).parse(value);
}

export function assertStudioOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  const expected = host ? `${request.nextUrl.protocol}//${host.toLowerCase()}` : request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== expected)) {
    throw new StudioAccessError("Yêu cầu không hợp lệ. Hãy tải lại trang và thử lại.", 403, "INVALID_ORIGIN");
  }
}

export async function studioRead(request: NextRequest, operation: (user: AuthenticatedUser) => Promise<NextResponse>) {
  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;
    return await operation(auth.user);
  } catch (error) { return studioError(error); }
}

export async function studioJson<T>(request: NextRequest, schema: ZodType<T>, operation: (user: AuthenticatedUser, input: T) => Promise<NextResponse>) {
  return studioRead(request, async (user) => {
    assertStudioOrigin(request);
    return operation(user, schema.parse(await readWritingJson(request)));
  });
}
