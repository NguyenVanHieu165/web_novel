import "server-only";

import { NextResponse } from "next/server";

export const MAX_SPREADSHEET_REQUEST_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_REQUEST_BYTES = 10 * 1024 * 1024;

export function rejectOversizeUpload(request: Request, maxBytes: number) {
  const length = request.headers.get("content-length");
  if (length === null) return null;
  const bytes = Number(length);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxBytes) {
    return NextResponse.json({ success: false, message: "Tệp tải lên vượt quá dung lượng cho phép." }, { status: 413 });
  }
  return null;
}
