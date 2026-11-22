import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ChapterDocumentError, MAX_CHAPTER_DOCUMENT_BYTES, parseChapterDocument } from "@/lib/chapter-document-parser";
import { StudioAccessError } from "./studio-ownership";

export function writingOriginError(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const expected = host ? `${request.nextUrl.protocol}//${host.toLowerCase()}` : request.nextUrl.origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && origin !== expected))
    return NextResponse.json({ success: false, message: "Yêu cầu khác nguồn không được chấp nhận." }, { status: 403 });
  return null;
}
async function boundedBody(request: NextRequest, maximum: number) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maximum) throw new ChapterDocumentError("Dữ liệu gửi lên quá lớn.", "DOCUMENT_TOO_LARGE", 413);
  if (!request.body) throw new ChapterDocumentError("Yêu cầu chưa có nội dung.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new ChapterDocumentError("Dữ liệu gửi lên quá lớn.", "DOCUMENT_TOO_LARGE", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export async function readWritingJson(request: NextRequest): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new ChapterDocumentError("Yêu cầu cần có định dạng JSON.", "UNSUPPORTED_MEDIA", 415);
  try { return JSON.parse((await boundedBody(request, 12 * 1024 * 1024)).toString("utf8")); }
  catch (error) { if (error instanceof ChapterDocumentError) throw error; throw new ChapterDocumentError("JSON không hợp lệ."); }
}
export async function previewChapterDocument(request: NextRequest) {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) throw new ChapterDocumentError("Vui lòng gửi file bằng multipart/form-data.", "UNSUPPORTED_MEDIA", 415);
  const bytes = await boundedBody(request, MAX_CHAPTER_DOCUMENT_BYTES + 64 * 1024);
  let form: FormData;
  try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } }).formData(); }
  catch { throw new ChapterDocumentError("Không đọc được file tải lên."); }
  const file = form.get("file");
  if (!file || typeof file === "string") throw new ChapterDocumentError("Vui lòng chọn file soạn thảo.");
  return parseChapterDocument(file);
}
export function writingErrorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Dữ liệu không hợp lệ.", errors: error.issues }, { status: 400 });
  if (error instanceof StudioAccessError || error instanceof ChapterDocumentError) return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status });
  console.error("Chapter writing failed", typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN");
  return NextResponse.json({ success: false, code: "WRITING_FAILED", message: "Không thể lưu chương. Vui lòng thử lại." }, { status: 500 });
}
