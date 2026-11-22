import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ImportSourceError, importUrlSchema, terminal, type ImportJob, type ImportOptions } from "./types";

export type JobCheckpoint = { version: 1; owner: number; state: ImportJob; options: ImportOptions; updated: number };
const stateSchema = z.object({
  id: z.string().uuid(), status: z.enum(["queued", "running", "cancelling", "completed", "partial", "cancelled", "failed", "interrupted"]),
  storyTitle: z.string(), totalChapters: z.number(), processedChapters: z.number(), savedChapters: z.number(),
  skippedChapters: z.number(), lockedChapters: z.number(), failedChapters: z.number(), downloadedImages: z.number(),
  logs: z.array(z.string()).max(150),
}).passthrough();
export const checkpointSchema = z.object({ version: z.literal(1), owner: z.number().int(), state: stateSchema, options: importUrlSchema, updated: z.number() });
const MAX_CHECKPOINT_BYTES = 1024 * 1024;

/** Local, private checkpoints; never write source content or credentials here. */
export function checkpointStore(directory = path.join(process.cwd(), ".data/story-imports")) {
  let writes = Promise.resolve();
  const filename = (id: string) => path.join(directory, z.string().uuid().parse(id) + ".json");
  const cooldownFile = (host: string) => path.join(directory, `cooldown-${createHash("sha256").update(host).digest("hex")}.json`);
  return {
    write(record: JobCheckpoint) {
      const snapshot = JSON.stringify(record);
      const host = new URL(record.options.url).hostname, retryAt = record.state.retryAt;
      const operation = writes.catch(() => undefined).then(async () => {
        if (Buffer.byteLength(snapshot) > MAX_CHECKPOINT_BYTES) throw new ImportSourceError("Checkpoint vượt giới hạn dung lượng. Các chương đã lưu vẫn được giữ nguyên.", "CHECKPOINT_INVALID");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const file = filename(record.state.id), temp = file + "." + randomUUID() + ".tmp";
        try { await writeFile(temp, snapshot, { mode: 0o600, flag: "wx" }); await rename(temp, file); }
        finally { await rm(temp, { force: true }); }
        if (retryAt && retryAt > Date.now()) {
          const cooldown = cooldownFile(host), temp = cooldown + "." + randomUUID() + ".tmp";
          let previous = 0;
          try { previous = z.object({ retryAt: z.number() }).parse(JSON.parse(await readFile(cooldown, "utf8"))).retryAt; }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          try { await writeFile(temp, JSON.stringify({ retryAt: Math.max(previous, retryAt) }), { mode: 0o600, flag: "wx" }); await rename(temp, cooldown); }
          finally { await rm(temp, { force: true }); }
        }
      });
      writes = operation; return operation;
    },
    async cooldown(host: string) {
      try { return z.object({ retryAt: z.number().finite() }).parse(JSON.parse(await readFile(cooldownFile(host), "utf8"))).retryAt; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw new ImportSourceError("Không đọc được thời gian chờ nguồn; kiểm tra checkpoint trước khi thử lại.", "CHECKPOINT_INVALID"); }
    },
    async read(id: string, owner: number): Promise<JobCheckpoint | null> {
      let data: unknown;
      try {
        const bytes = await readFile(filename(id)); if (bytes.length > MAX_CHECKPOINT_BYTES) throw new ImportSourceError("Checkpoint vượt giới hạn dung lượng; hãy tạo phiên import mới và bật bỏ qua chương đã tồn tại.", "CHECKPOINT_INVALID");
        data = JSON.parse(bytes.toString("utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new ImportSourceError("Không đọc được checkpoint; hãy tạo phiên import mới và bật bỏ qua chương đã tồn tại.", "CHECKPOINT_INVALID");
      }
      const parsed = checkpointSchema.safeParse(data);
      if (!parsed.success) throw new ImportSourceError("Checkpoint không đúng cấu trúc hoặc phiên bản; hãy tạo phiên import mới và bỏ qua chương đã tồn tại.", "CHECKPOINT_INVALID");
      const result = parsed.data;
      if (result.owner !== owner || result.state.id !== id) return null;
      // State/options originally written by this process, with shape/version checked.
      const record = result as JobCheckpoint;
      if (!terminal(record.state.status)) {
        record.state.status = "interrupted"; record.state.phase = "finished"; record.state.errorCode = "SERVER_INTERRUPTED";
        record.state.error = "Server đã khởi động lại hoặc phiên chạy bị gián đoạn. Bấm tiếp tục để lấy các chương còn thiếu.";
      }
      record.state.sourceUrl = record.options.url; record.state.options = record.options;
      return record;
    },
  };
}
