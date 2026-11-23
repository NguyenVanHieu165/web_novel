import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { loadNotificationModule as load } from "./notification-support.mjs";

const sourceUrl = "https://source.example/cover.png";
const cloudUrl = "https://res.cloudinary.com/review/image/upload/v1/cover.webp";
const configured = { VERCEL: "1", CLOUDINARY_CLOUD_NAME: "review", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret" };
const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#123456" } }).png().toBuffer();

test("admin story list route does not eagerly load native image processing", async () => {
  const source = await readFile(new URL("../app/api/admin/stories/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import .*@\/lib\/cloudinary/m);
  assert.match(source, /await import\("@\/lib\/cloudinary"\)/);
});

test("Cloudinary loads sharp only when image bytes require normalization", async () => {
  const source = await readFile(new URL("../lib/cloudinary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import sharp from "sharp";/m);
  assert.match(source, /await import\("sharp"\)/);
});

function uploader(env = configured, fetcher = async () => Response.json({ secure_url: cloudUrl })) {
  const disk = [], requests = [];
  const api = load("lib/cloudinary.ts", {
    "node:fs/promises": { mkdir: async (...args) => disk.push(["mkdir", ...args]), writeFile: async (...args) => disk.push(["write", ...args]) },
    "./scraper/network": {
      async publicTarget(raw, signal) { signal?.throwIfAborted(); const url = new URL(raw); if (!["https:", "http:"].includes(url.protocol) || url.hostname === "127.0.0.1") throw Error("Private URL"); return { url }; },
      async safeRequest() { return { bytes: png, type: "image/png" }; },
    },
  }, { Buffer, Blob, FormData, Response, process: { env, cwd: () => process.cwd() },
    fetch: async (...args) => { requests.push(args); return fetcher(...args); } });
  return { ...api, disk, requests };
}

test("Cloudinary signs folder/timestamp, sends normalized Buffer and returns secure HTTPS URL", async () => {
  const app = uploader();
  assert.equal(await app.uploadImageToCloudinary(png), cloudUrl);
  const [url, request] = app.requests[0], form = request.body;
  assert.equal(url, "https://api.cloudinary.com/v1_1/review/image/upload");
  assert.equal(form.get("signature"), createHash("sha1").update("folder=web-novel/covers&timestamp=" + form.get("timestamp") + "test-secret").digest("hex"));
  assert.equal(form.get("api_key"), "test-key");
  assert.equal(form.has("api_secret"), false);
  assert.equal(form.get("file").type, "image/webp");
  assert.equal(app.disk.length, 0);
});

test("URL input and CLOUDINARY_URL credentials use the same signed upload", async () => {
  const app = uploader({ VERCEL: "1", CLOUDINARY_URL: "cloudinary://url-key:url-secret@review" });
  assert.equal(await app.uploadImageToCloudinary(sourceUrl, "web-novel/avatars"), cloudUrl);
  const form = app.requests[0][1].body;
  assert.equal(form.get("file"), sourceUrl);
  assert.equal(form.get("folder"), "web-novel/avatars");
  assert.equal(form.get("api_key"), "url-key");
});

test("Vercel missing configuration or failed network returns the original URL without disk writes", async () => {
  for (const app of [uploader({ VERCEL: "1" }), uploader(configured, async () => { throw Error("private diagnostic test-secret"); })]) {
    assert.equal(await app.uploadImageToCloudinary(sourceUrl), sourceUrl);
    assert.equal(app.disk.length, 0);
  }
});

test("scraper remote fallback never normalizes bytes or writes to local disk", async () => {
  const app = uploader({});
  assert.equal(await app.uploadImageToCloudinary(sourceUrl, "web-novel/chapters/story", undefined, { remoteSourceFallback: true }), sourceUrl);
  assert.equal(app.disk.length, 0);
});

test("Vercel Buffer failures are safe application errors and never write files", async () => {
  for (const app of [uploader({ VERCEL: "1" }), uploader(configured, async () => Response.json({ error: "test-secret" }, { status: 500 }))]) {
    await assert.rejects(app.uploadImageToCloudinary(png), error => error instanceof app.ImageUploadError && error.status === 503 && !error.message.includes("test-secret"));
    assert.equal(app.disk.length, 0);
  }
});

test("only missing local configuration enables normalized local image fallback", async () => {
  const app = uploader({});
  const result = await app.uploadImageToCloudinary(sourceUrl, "web-novel/avatars");
  assert.match(result, /^\/uploads\/avatars\/[a-f0-9]{64}\.webp$/);
  assert.equal(app.disk.length, 2);
  const bytes = app.disk[1][2];
  assert.equal((await sharp(bytes).metadata()).format, "webp");
  const failed = uploader({ ...configured, VERCEL: undefined }, async () => { throw Error("network"); });
  await assert.rejects(failed.uploadImageToCloudinary(sourceUrl), error => error.code === "IMAGE_UPLOAD_FAILED");
  assert.equal(failed.disk.length, 0);
});

test("private URLs, path traversal, invalid bytes and cancellation cannot become upload fallbacks", async () => {
  const app = uploader();
  await assert.rejects(app.uploadImageToCloudinary("http://127.0.0.1/secret"), error => error.code === "INVALID_IMAGE_URL");
  await assert.rejects(app.uploadImageToCloudinary(png, "../outside"), error => error.code === "INVALID_IMAGE_FOLDER");
  await assert.rejects(app.uploadImageToCloudinary(Buffer.from("not an image")), error => error.code === "INVALID_IMAGE");
  const controller = new AbortController(); controller.abort(new DOMException("cancelled", "AbortError"));
  await assert.rejects(app.uploadImageToCloudinary(sourceUrl, "web-novel/covers", controller.signal), error => error.name === "AbortError");
  assert.equal(app.requests.length, 0); assert.equal(app.disk.length, 0);
});

function checkpointHarness() {
  const rows = new Map(), calls = [];
  const types = load("lib/scraper/types.ts");
  const checkpoints = load("lib/scraper/checkpoints.ts", { "./types": types }, { Buffer });
  const api = load("lib/scraper/database-checkpoints.ts", { "./checkpoints": checkpoints, "./types": types }, { Buffer, structuredClone });
  const db = { caiDatHeThong: { async findUnique({ where }) { return rows.has(where.khoa) ? { giaTri: rows.get(where.khoa) } : null; } },
    async $executeRaw(strings, ...values) {
      const sql = strings.join("?"); calls.push(sql);
      if (sql.includes("DELETE")) return 0;
      const [key, json, active] = values, incoming = JSON.parse(json), old = rows.has(key) ? JSON.parse(rows.get(key)) : null;
      if (sql.includes("Checkpoint import URL")) {
        if (active && old && types.terminal(old.state.status)) return 0;
        if (active && old?.state.status === "cancelling") incoming.state.status = "cancelling";
      } else incoming.retryAt = Math.max(incoming.retryAt, old?.retryAt ?? 0);
      rows.set(key, JSON.stringify(incoming)); return 1;
    } };
  return { api, db, rows, calls, types, checkpoints, store: api.databaseCheckpointStore(db) };
}
function record(status = "running") {
  return { version: 1, owner: 7, updated: Date.now(), options: { url: "https://source.example/book", downloadImages: true, skipExisting: true, skipLocked: true },
    state: { id: randomUUID(), status, storyTitle: "Story", totalChapters: 5, processedChapters: 1, savedChapters: 1, skippedChapters: 0, lockedChapters: 0, failedChapters: 0, downloadedImages: 0, logs: [] } };
}

test("shared checkpoints retain live progress across instances and reject wrong owners", async () => {
  const app = checkpointHarness(), job = record(); await app.store.write(job);
  const other = app.api.databaseCheckpointStore(app.db);
  assert.equal((await other.read(job.state.id, 7)).state.status, "running");
  assert.equal(await other.read(job.state.id, 8), null);
  job.updated = Date.now() - 70_000; await app.store.write(job);
  assert.equal((await other.read(job.state.id, 7)).state.status, "interrupted");
  assert.equal(JSON.parse(app.rows.get("import.job." + job.state.id)).state.status, "running");
});

test("database snapshots fit TEXT without losing counters/options and preserve source cooldown", async () => {
  const app = checkpointHarness(), job = record();
  job.state.logs = Array.from({ length: 150 }, () => "Tiếng Việt ".repeat(110));
  job.state.retryAt = Date.now() + 30_000;
  await app.store.write(job);
  const json = app.rows.get("import.job." + job.state.id);
  assert.ok(Buffer.byteLength(json) <= 60_000);
  assert.equal(JSON.parse(json).state.savedChapters, 1);
  assert.equal(JSON.parse(json).options.url, job.options.url);
  assert.equal(await app.store.cooldown("source.example"), job.state.retryAt);
});

test("cancel cannot be overwritten by active snapshots and late cancel cannot revive terminal jobs", async () => {
  const app = checkpointHarness(), job = record();
  await app.store.write(job);
  job.state.status = "cancelling"; await app.store.write(job);
  job.state.status = "running"; await app.store.write(job);
  assert.equal((await app.store.read(job.state.id, 7)).state.status, "cancelling");
  job.state.status = "completed"; await app.store.write(job);
  job.state.status = "cancelling"; await app.store.write(job);
  assert.equal((await app.store.read(job.state.id, 7)).state.status, "completed");
  assert.ok(app.calls.some(sql => sql.includes("JSON_SET")));
});

test("Vercel job creation uses the database store without initializing a filesystem checkpoint", async () => {
  const app = checkpointHarness();
  const jobs = load("lib/scraper/job-manager.ts", {
    "../prisma": { prisma: app.db }, "./network": { sourceClient() {} }, "./adapters": {}, "./normalizer": {},
    "./errors": {}, "./media": {}, "./storage": {},
    "./checkpoints": { checkpointStore() { throw Error("EROFS"); } },
    "./database-checkpoints": app.api, "./types": app.types,
    "../server/system-log-sanitizer": { safeErrorDiagnostic: error => ({ name: error?.name || "Error" }) },
  }, { Buffer, structuredClone, process: { env: { VERCEL: "1" } } });
  const id = await jobs.createJob(7, record().options);
  assert.equal((await jobs.getJob(id, 7)).status, "queued");
  assert.equal(app.rows.has("import.job." + id), true);
});

test("import media retains source policy and allows only Cloudinary failures to fall back to the validated URL", async () => {
  const cloud = uploader({ VERCEL: "1" });
  const media = load("lib/scraper/media.ts", { "./types": checkpointHarness().types, "../cloudinary": cloud }, { process: { env: { VERCEL: "1" } } });
  const client = { signal: new AbortController().signal, get: async () => ({ type: "image/png", bytes: png }) };
  assert.equal(await media.downloadImage(sourceUrl, sourceUrl, "covers", client, () => {}), sourceUrl);
  await assert.rejects(media.downloadImage(sourceUrl, sourceUrl, "covers", { ...client, get: async () => ({ type: "image/svg+xml", bytes: png }) }, () => {}), /không hợp lệ/);
});
