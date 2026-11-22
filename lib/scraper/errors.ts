import { ZodError } from "zod";
import { ImportSourceError, SourceBlockedError, SourceLockedError, SourceRateLimitError } from "./types";
export function networkErrorCode(error: unknown) {
  if (error instanceof Error && error.cause instanceof Error && error.cause.name === "TimeoutError") return "TimeoutError";
  return error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.name : "";
}

export function importErrorCode(error: unknown) {
  if (error instanceof SourceRateLimitError) return "RATE_LIMITED";
  if (error instanceof SourceBlockedError) return "ACCESS_BLOCKED";
  if (error instanceof SourceLockedError) return "SOURCE_LOCKED";
  if (error instanceof ImportSourceError) return error.code;
  if (error instanceof ZodError || error instanceof SyntaxError) return "SOURCE_FORMAT_CHANGED";
  const code = networkErrorCode(error);
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "DNS_FAILED";
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "TimeoutError"].includes(code)) return "NETWORK_FAILED";
  if (/CERT|SSL|TLS|UNABLE_TO_VERIFY/.test(code)) return "TLS_FAILED";
  return "IMPORT_FAILED";
}

export function importErrorMessage(error: unknown) {
  if (error instanceof ImportSourceError || error instanceof SourceBlockedError || error instanceof SourceLockedError) return error.message;
  if (error instanceof ZodError || error instanceof SyntaxError) return "Dữ liệu nguồn không đúng cấu trúc được hỗ trợ. Website có thể đã thay đổi hoặc cần adapter riêng.";
  const code = networkErrorCode(error);
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "Không phân giải được tên miền nguồn. Kiểm tra URL và kết nối mạng rồi thử lại.";
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "TimeoutError"].includes(code)) return `Không kết nối được website nguồn (${code}). Kiểm tra mạng hoặc thử lại sau.`;
  if (/CERT|SSL|TLS|UNABLE_TO_VERIFY/.test(code)) return "Không xác minh được chứng chỉ HTTPS của nguồn. Không thể tiếp tục kết nối an toàn.";
  return "Có lỗi khi xử lý import. Các chương đã lưu được giữ nguyên; hãy thử lại hoặc kiểm tra log server.";
}
