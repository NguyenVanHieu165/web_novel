import { ZodError } from "zod";
import { ImportSourceError, SourceBlockedError, SourceLockedError, SourceRateLimitError } from "./types";

const databaseErrors: Record<string, string> = {
  P1001: "Không kết nối được database.",
  P1002: "Kết nối database hết thời gian chờ.",
  P2002: "Dữ liệu chương vi phạm ràng buộc duy nhất.",
  P2003: "Dữ liệu chương vi phạm khóa ngoại.",
  P2010: "Câu lệnh database dùng khi import thực thi thất bại.",
  P2022: "Database đang thiếu cột mà importer cần sử dụng.",
  P2025: "Không tìm thấy bản ghi database cần cập nhật.",
  P2034: "Giao dịch database bị xung đột hoặc deadlock.",
};
const filesystemErrors: Record<string, string> = {
  EACCES: "Tiến trình không có quyền truy cập đường dẫn lưu trữ.",
  ENOENT: "Không tìm thấy file hoặc thư mục cần thiết.",
  ENOSPC: "Ổ đĩa không còn dung lượng trống.",
  EPERM: "Hệ điều hành từ chối thao tác file.",
  EROFS: "Ổ đĩa chỉ cho phép đọc. Không thể ghi file trong môi trường Serverless.",
};

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return null;
  const message = error.message.replace(/\s+/g, " ").trim();
  if (!message || /\b(?:SELECT|INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(message) ||
      /(?:password|token|secret|credential|authorization|cookie|api[-_ ]?key)\s*[=:]/i.test(message) ||
      /\b(?:mysql|mysql2|mariadb|postgres(?:ql)?):\/\//i.test(message)) return null;
  return message.slice(0, 800);
}

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
  if (/^P\d{4}$/.test(code) || code in filesystemErrors) return code;
  return "IMPORT_FAILED";
}

export function importErrorMessage(error: unknown) {
  if (error instanceof ImportSourceError || error instanceof SourceBlockedError || error instanceof SourceLockedError) return error.message;
  if (error instanceof ZodError || error instanceof SyntaxError) return "Dữ liệu nguồn không đúng cấu trúc được hỗ trợ. Website có thể đã thay đổi hoặc cần adapter riêng.";
  const code = networkErrorCode(error);
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "Không phân giải được tên miền nguồn. Kiểm tra URL và kết nối mạng rồi thử lại.";
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "TimeoutError"].includes(code)) return `Không kết nối được website nguồn (${code}). Kiểm tra mạng hoặc thử lại sau.`;
  if (/CERT|SSL|TLS|UNABLE_TO_VERIFY/.test(code)) return "Không xác minh được chứng chỉ HTTPS của nguồn. Không thể tiếp tục kết nối an toàn.";
  if (/^P\d{4}$/.test(code)) return `Lỗi database (${code}): ${databaseErrors[code] ?? "Prisma không thể hoàn tất thao tác lưu chương."}`;
  if (code in filesystemErrors) return `Lỗi filesystem (${code}): ${filesystemErrors[code]}`;
  const detail = safeErrorMessage(error);
  if (detail) return `Lỗi import (${error instanceof Error ? error.name : "Error"}): ${detail}`;
  return "Có lỗi khi xử lý import. Các chương đã lưu được giữ nguyên; hãy thử lại hoặc kiểm tra log server.";
}
