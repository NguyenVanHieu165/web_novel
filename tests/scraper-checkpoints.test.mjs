import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { checkpointStore } from "../lib/scraper/checkpoints.ts";

function fixture(status = "running") {
  return { version: 1, owner: 9, updated: 1000, options: { url: "https://example.com/book", downloadImages: true, skipExisting: true, skipLocked: true },
    state: { id: randomUUID(), status, storyTitle: "Story", totalChapters: 100, processedChapters: 2, savedChapters: 2, skippedChapters: 0, lockedChapters: 0, failedChapters: 0, downloadedImages: 1, logs: ["saved"] } };
}
async function directory(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "novel-import-checkpoint-"));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}

test("checkpoint writes are serialized atomic snapshots and recover after a failed write", async t => {
  const dir = await directory(t), store = checkpointStore(dir), record = fixture("completed");
  const operations = [];
  for (let i = 0; i < 12; i++) {
    record.state.processedChapters = i; record.state.logs = [String(i)]; operations.push(store.write(record));
  }
  await Promise.all(operations);
  const saved = await store.read(record.state.id, record.owner);
  assert.equal(saved.state.processedChapters, 11); assert.deepEqual(saved.state.logs, ["11"]);
  assert.deepEqual(await readdir(dir), [record.state.id + ".json"], "No partial temporary files remain");
  const invalid = { ...record, state: { ...record.state, logs: ["x".repeat(1024 * 1024)] } };
  await assert.rejects(store.write(invalid), /giới hạn/);
  await store.write(record); assert.equal((await store.read(record.state.id, record.owner)).state.processedChapters, 11);
});

test("checkpoint recovery is owner scoped and marks unfinished jobs as interrupted after restart", async t => {
  const dir = await directory(t), store = checkpointStore(dir), record = fixture(); await store.write(record);
  const restarted = checkpointStore(dir);
  assert.equal(await restarted.read(record.state.id, record.owner + 1), null);
  const found = await restarted.read(record.state.id, record.owner);
  assert.equal(found.state.status, "interrupted"); assert.equal(found.state.errorCode, "SERVER_INTERRUPTED");
  assert.equal(found.state.savedChapters, 2); assert.equal(found.state.options.url, record.options.url);
  assert.equal(found.state.sourceUrl, record.options.url);
  const disk = JSON.parse(await readFile(path.join(dir, record.state.id + ".json"), "utf8"));
  assert.equal(disk.state.status, "running", "Read/recovery never mutates persisted bytes");
});

test("terminal jobs retain status, missing IDs return null, invalid IDs and corrupt files fail closed", async t => {
  const dir = await directory(t), store = checkpointStore(dir), record = fixture("completed"); await store.write(record);
  assert.equal((await checkpointStore(dir).read(record.state.id, record.owner)).state.status, "completed");
  assert.equal(await store.read(randomUUID(), record.owner), null);
  await assert.rejects(store.read("../../outside", record.owner), /checkpoint/i);
  await writeFile(path.join(dir, record.state.id + ".json"), "{not JSON");
  await assert.rejects(store.read(record.state.id, record.owner), error => error.code === "CHECKPOINT_INVALID");
  await writeFile(path.join(dir, record.state.id + ".json"), JSON.stringify({ ...record, version: 2 }));
  await assert.rejects(store.read(record.state.id, record.owner), error => error.code === "CHECKPOINT_INVALID");
  await writeFile(path.join(dir, record.state.id + ".json"), "x".repeat(1024 * 1024 + 1));
  await assert.rejects(store.read(record.state.id, record.owner), error => error.code === "CHECKPOINT_INVALID");
});

test("checkpoint state ID must match its filename before any job is returned", async t => {
  const dir = await directory(t), store = checkpointStore(dir), record = fixture("cancelled");
  const filenameId = randomUUID(); await writeFile(path.join(dir, filenameId + ".json"), JSON.stringify(record));
  assert.equal(await store.read(filenameId, record.owner), null);
});
