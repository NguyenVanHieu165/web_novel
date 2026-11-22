import { z } from "zod";

export const importUrlSchema = z.object({
  url: z.string().url().max(2000),
  maxChapters: z.number().int().positive().max(50000).optional(),
  downloadImages: z.boolean().default(true),
  skipExisting: z.boolean().default(true),
  skipLocked: z.boolean().default(true),
}).strict();
export type ImportOptions = z.infer<typeof importUrlSchema>;
export type ChapterRef = { url: string; number: number; title: string; locked?: boolean };
export type ScrapedStory = {
  title: string; slug: string; description: string; cover?: string; authors: string[];
  genres: string[]; completed: boolean; views: number; chapters: ChapterRef[];
  sourceName?: string; catalogueComplete?: boolean; sourceTotalChapters?: number; warnings?: string[];
};
export type JobStatus = "queued" | "running" | "cancelling" | "completed" | "partial" | "cancelled" | "failed" | "interrupted";
export type ImportJob = {
  id: string; status: JobStatus; storyTitle: string; storySlug?: string; storyId?: number;
  cover?: string; totalChapters: number; processedChapters: number; savedChapters: number;
  skippedChapters: number; lockedChapters: number; failedChapters: number; downloadedImages: number;
  logs: string[]; error?: string;
  phase?: "metadata" | "catalogue" | "chapters" | "waiting" | "finished";
  sourceHost?: string; sourceUrl?: string; sourceName?: string; options?: ImportOptions;
  errorCode?: string; retryAt?: number; warning?: string; catalogueComplete?: boolean; sourceTotalChapters?: number;
  issues?: Array<{ chapter?: number; code: string; reason: string }>;
};
export const terminal = (status: JobStatus) => ["completed", "partial", "cancelled", "failed", "interrupted"].includes(status);
/** Only application-authored source errors are safe to display to an Admin. */
export class ImportSourceError extends Error {
  constructor(message: string, readonly code = "SOURCE_ERROR") { super(message); }
}
export class SourceLockedError extends Error { constructor() { super("Chương bị khóa, VIP, yêu cầu đăng nhập hoặc chỉ có bản xem thử."); } }
export class SourceBlockedError extends Error {
  constructor(message = "Nguồn chặn truy cập hoặc yêu cầu kiểm tra bảo mật. Đã dừng import.") { super(message); }
}
export class SourceRateLimitError extends SourceBlockedError {
  readonly retryAt: number;
  constructor(status: number, retryAfter?: string, bodySeconds?: number, now = Date.now()) {
    super();
    const headerMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : retryAfter ? Date.parse(retryAfter) - now : 0;
    const delay = Math.max(3000, Number.isFinite(headerMs) ? headerMs : 0, Number.isFinite(bodySeconds) ? Math.max(0, bodySeconds!) * 1000 : 0);
    this.retryAt = now + delay;
    this.message = `Nguồn đang giới hạn truy cập (HTTP ${status}). Hãy chờ ít nhất ${Math.ceil(delay / 1000)} giây rồi thử lại.`;
  }
}
