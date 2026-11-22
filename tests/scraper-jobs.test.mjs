import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkpointStore } from "../lib/scraper/checkpoints.ts";
import { createJob, runJob, getJob, resumeJob, cancelJob } from "../lib/scraper/job-manager.ts";
import { ImportSourceError, SourceLockedError } from "../lib/scraper/types.ts";
import { pause } from "../lib/scraper/network.ts";

const options = { url: "https://example.com/book", skipExisting: true, skipLocked: true, downloadImages: false };
const story = (count, complete = true) => ({ title: "Story", slug: "story", description: "", authors: [], genres: [], completed: false, views: 0, catalogueComplete: complete,
  chapters: Array.from({ length: count }, (_, i) => ({ number: i + 1, title: `Chương ${i + 1}`, url: `https://example.com/chapter-${i + 1}` })) });
async function fixture(t, count = 24, complete = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "import-jobs-")); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = checkpointStore(directory), saved = new Set();
  const db = { async $queryRaw(strings) { return strings[0].includes("SELECT DATABASE") ? [{ db: "web_truyen" }] : [...saved].map(chuongSo => ({ chuongSo })); }, chuong: { async count() { return saved.size; } }, truyen: { async update() {} } };
  const services = { db, async scrapeStory() { return story(count, complete); }, async findStory() { return { idTruyen: 1, slug: "story", anhBia: "", isDeleted: false }; },
    async scrapeChapter() { return "<p>Toàn văn tiếng Việt có nội dung đủ dài để kiểm tra chương import an toàn.</p>"; },
    async storeChapter(_db, _id, ref) { saved.add(ref.number); return true; }, budgetMs: 10000 };
  const before = process.env.DATABASE_NAME; process.env.DATABASE_NAME = "web_truyen";
  t.after(() => { if (before == null) delete process.env.DATABASE_NAME; else process.env.DATABASE_NAME = before; });
  return { store, saved, services };
}
test("all mode processes beyond 15, bounds workers to four, and resumes without duplicate writes", async t => {
  const f = await fixture(t); let active = 0, peak = 0;
  f.services.scrapeChapter = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); active--; return "Full public content ".repeat(10); };
  const id = await createJob(44, options, f.store);
  assert.equal(await getJob(id, 99), null);
  await runJob(id, f.services); const result = await getJob(id, 44);
  assert.equal(result.status, "completed"); assert.equal(result.savedChapters, 24); assert.equal(result.processedChapters, 24); assert.ok(peak <= 4);
  assert.equal(result.options.maxChapters, undefined);
  const resumed = await resumeJob(id, 44); await runJob(resumed, f.services);
  const repeated = await getJob(resumed, 44); assert.equal(repeated.savedChapters, 0); assert.equal(repeated.skippedChapters, 24);
});
test("uncertain full catalogue yields partial, locks are distinct from errors, and cancellation stops a running job", async t => {
  const f = await fixture(t, 5, false);
  f.services.scrapeChapter = async ref => { if (ref.number === 2) throw new SourceLockedError(); if (ref.number === 3) throw new ImportSourceError("Nguồn thiếu toàn văn.", "INCOMPLETE_CONTENT"); return "Readable content ".repeat(10); };
  const id = await createJob(44, options, f.store); await runJob(id, f.services);
  const result = await getJob(id, 44); assert.equal(result.status, "partial"); assert.equal(result.lockedChapters, 1); assert.equal(result.failedChapters, 1); assert.match(result.warning, /Chưa xác nhận/);
  assert.ok(result.issues.some(e => e.code === "INCOMPLETE_CONTENT"));
  f.saved.clear(); f.services.scrapeChapter = async (_ref, client) => { await pause(1000, client.signal); return "Text ".repeat(30); };
  const cancelled = await createJob(44, options, f.store); const running = runJob(cancelled, f.services);
  await new Promise(r => setTimeout(r, 15)); await cancelJob(cancelled, 44); await running;
  assert.equal((await getJob(cancelled, 44)).status, "cancelled"); assert.equal(f.saved.size, 0);
});
test("time-bounded job becomes resumable interruption instead of false completion", async t => {
  const f = await fixture(t, 3); f.services.budgetMs = 15;
  f.services.scrapeChapter = async (_ref, client) => { await pause(1000, client.signal); return "Text ".repeat(30); };
  const id = await createJob(44, options, f.store); await runJob(id, f.services);
  const result = await getJob(id, 44); assert.equal(result.status, "interrupted"); assert.equal(result.errorCode, "TIME_BUDGET");
  assert.equal((await f.store.read(id, 44)).state.status, "interrupted");
});
test("first readable chapter uses atomic story creation and never creates metadata for locked-only books", async t => {
  const f = await fixture(t, 2); let calls = 0;
  f.services.findStory = async () => null;
  f.services.createStory = async (_db, _story, _url, _cover, ref, content) => { calls++; assert.ok(content.length > 50); f.saved.add(ref.number); return { idTruyen: 1, slug: "story", anhBia: "", isDeleted: false }; };
  const id = await createJob(44, options, f.store); await runJob(id, f.services); assert.equal(calls, 1); assert.equal((await getJob(id, 44)).savedChapters, 2);
  f.services.scrapeChapter = async () => { throw new SourceLockedError(); };
  const locked = await createJob(44, options, f.store); await runJob(locked, f.services);
  assert.equal(calls, 1); assert.equal((await getJob(locked, 44)).errorCode, "NO_READABLE_CHAPTERS");
});
test("checkpoint failure aborts and settles siblings before marking terminal", async t => {
  const f = await fixture(t, 8); let writes = 0, inFlight = 0;
  const broken = { ...f.store, async write(record) { if (++writes === 4) throw Error("disk full"); return f.store.write(record); } };
  f.services.storeChapter = async (_db, _id, ref) => { inFlight++; await new Promise(r => setTimeout(r, ref.number === 1 ? 1 : 30)); f.saved.add(ref.number); inFlight--; return true; };
  const id = await createJob(44, options, broken); await runJob(id, f.services);
  const result = await getJob(id, 44); assert.equal(result.status, "failed"); assert.equal(result.errorCode, "CHECKPOINT_FAILED"); assert.equal(inFlight, 0);
  const count = f.saved.size; await new Promise(r => setTimeout(r, 40)); assert.equal(f.saved.size, count);
});
test("fresh requests also respect durable source cooldown instead of resetting rate limits", async t => {
  const f = await fixture(t, 1);
  const id = await createJob(44, options, f.store); await runJob(id, f.services);
  const snapshot = await f.store.read(id, 44); snapshot.state.retryAt = Date.now() + 10000; await f.store.write(snapshot);
  await assert.rejects(createJob(44, options, f.store), error => error.code === "RATE_LIMITED");
});
test("an inaccessible image preserves chapter text and reports partial rather than losing the chapter", async t => {
  const f = await fixture(t, 1); let body;
  f.services.scrapeChapter = async () => '<p>Full public text remains readable. '.repeat(4) + '</p><img data-src="http://127.0.0.1/not-allowed.jpg">';
  f.services.storeChapter = async (_db, _id, ref, content) => { body = content; f.saved.add(ref.number); return true; };
  const id = await createJob(44, { ...options, downloadImages: true }, f.store);
  await runJob(id, f.services); const result = await getJob(id, 44);
  assert.equal(result.savedChapters, 1); assert.equal(result.status, "partial"); assert.match(body, /Full public text/);
  assert.ok(!body.includes("127.0.0.1")); assert.ok(result.issues.some(i => i.code === "IMAGE_FAILED"));
});
