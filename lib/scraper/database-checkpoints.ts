import { createHash } from "node:crypto";
import type { PrismaClient } from "../../app/generated/prisma/client";
import { checkpointSchema, type JobCheckpoint } from "./checkpoints";
import { ImportSourceError, terminal } from "./types";

const maxBytes = 60_000;
const activeLeaseMs = 65_000;
const jobKey = (id: string) => "import.job." + id;
const cooldownKey = (host: string) => "import.cooldown." + createHash("sha256").update(host).digest("hex");

function snapshot(record: JobCheckpoint) {
  const copy = structuredClone(record);
  let json = JSON.stringify(copy);
  // MySQL TEXT is limited to 64 KiB. Retain progress/options and the newest diagnostics.
  while (Buffer.byteLength(json) > maxBytes) {
    if (copy.state.logs.length) copy.state.logs.shift();
    else if (copy.state.issues?.length) copy.state.issues.shift();
    else throw new ImportSourceError("Checkpoint vượt giới hạn dung lượng.", "CHECKPOINT_INVALID");
    json = JSON.stringify(copy);
  }
  return json;
}

/** Private durable checkpoints shared by Vercel instances, using the existing settings model. */
export function databaseCheckpointStore(db: Pick<PrismaClient, "caiDatHeThong" | "$executeRaw">) {
  let writes = Promise.resolve();
  let lastCleanup = 0;
  return {
    shared: true,
    write(record: JobCheckpoint) {
      const json = snapshot(record), key = jobKey(record.state.id);
      const retryAt = record.state.retryAt ?? 0;
      const active = !terminal(record.state.status);
      const operation = writes.catch(() => undefined).then(async () => {
        // Preserve cancellation requested by another instance until the worker settles.
        await db.$executeRaw`
          INSERT INTO cai_dat_he_thong (khoa, gia_tri, mo_ta)
          VALUES (${key}, ${json}, 'Checkpoint import URL')
          ON DUPLICATE KEY UPDATE gia_tri = CASE
            WHEN ${active} AND JSON_UNQUOTE(JSON_EXTRACT(gia_tri, '$.state.status'))
              IN ('completed', 'partial', 'cancelled', 'failed', 'interrupted') THEN gia_tri
            WHEN ${active} AND JSON_UNQUOTE(JSON_EXTRACT(gia_tri, '$.state.status')) = 'cancelling'
              THEN JSON_SET(${json}, '$.state.status', 'cancelling')
            ELSE ${json} END
        `;
        if (retryAt > Date.now()) {
          const cooldown = cooldownKey(new URL(record.options.url).hostname);
          await db.$executeRaw`
            INSERT INTO cai_dat_he_thong (khoa, gia_tri, mo_ta)
            VALUES (${cooldown}, ${JSON.stringify({ retryAt })}, 'Thời gian chờ nguồn import')
            ON DUPLICATE KEY UPDATE gia_tri = JSON_OBJECT('retryAt', GREATEST(
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(gia_tri, '$.retryAt')) AS UNSIGNED), 0), ${retryAt}))
          `;
        }
        if (Date.now() - lastCleanup > 3_600_000) {
          const cutoff = Date.now() - 7 * 24 * 3_600_000;
          await db.$executeRaw`
            DELETE FROM cai_dat_he_thong WHERE khoa LIKE 'import.job.%'
              AND CAST(JSON_UNQUOTE(JSON_EXTRACT(gia_tri, '$.updated')) AS UNSIGNED) < ${cutoff}
            LIMIT 100
          `;
          lastCleanup = Date.now();
        }
      });
      writes = operation;
      return operation;
    },
    async cooldown(host: string) {
      const row = await db.caiDatHeThong.findUnique({ where: { khoa: cooldownKey(host) }, select: { giaTri: true } });
      if (!row) return 0;
      try {
        const value: unknown = JSON.parse(row.giaTri);
        if (typeof value === "object" && value !== null && "retryAt" in value && typeof value.retryAt === "number" && Number.isFinite(value.retryAt)) return value.retryAt;
      } catch { /* Corrupt metadata is reported as an application error below. */ }
      throw new ImportSourceError("Thời gian chờ nguồn không hợp lệ.", "CHECKPOINT_INVALID");
    },
    async read(id: string, owner: number): Promise<JobCheckpoint | null> {
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new ImportSourceError("Mã checkpoint không hợp lệ.", "CHECKPOINT_INVALID");
      const row = await db.caiDatHeThong.findUnique({ where: { khoa: jobKey(id) }, select: { giaTri: true } });
      if (!row) return null;
      let parsed: ReturnType<typeof checkpointSchema.safeParse>;
      try { parsed = checkpointSchema.safeParse(JSON.parse(row.giaTri)); }
      catch { throw new ImportSourceError("Không đọc được checkpoint import.", "CHECKPOINT_INVALID"); }
      if (!parsed.success) throw new ImportSourceError("Checkpoint không đúng cấu trúc.", "CHECKPOINT_INVALID");
      const record = parsed.data as JobCheckpoint;
      if (record.owner !== owner || record.state.id !== id) return null;
      if (!terminal(record.state.status) && Date.now() - record.updated > activeLeaseMs) {
        record.state.status = "interrupted"; record.state.phase = "finished"; record.state.errorCode = "SERVER_INTERRUPTED";
        record.state.error = "Phiên chạy đã gián đoạn. Bấm tiếp tục để lấy các chương còn thiếu.";
      }
      record.state.sourceUrl = record.options.url; record.state.options = record.options;
      return record;
    },
  };
}
