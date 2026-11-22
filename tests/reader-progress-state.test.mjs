import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routeModule = { exports: {} };
const source = await readFile(new URL("../lib/reader-progress-state.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: routeModule, exports: routeModule.exports, require: createRequire(import.meta.url) });
const { classifyReaderScroll, createProgressSaveQueue, measureReadingProgress, resumeScrollPosition, readLocalProgress, writeLocalProgress, selectResumeProgress, progressScope, normalizePoint } = routeModule.exports;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function storage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function record(overrides = {}) {
  return { position: 700, percent: 70, scope: "account:7", chapterId: 11, updatedAt: 1000, pending: true, ...overrides };
}

test("save queue serializes the latest point during an in-flight save and departure", async () => {
  const first = deferred();
  const calls = [];
  const persisted = [];
  const queue = createProgressSaveQueue({
    save: async (point, keepalive) => { calls.push({ ...point, keepalive }); if (calls.length === 1) await first.promise; },
    persist: (point, pending) => persisted.push({ ...point, pending }),
  });
  queue.enqueue({ position: 100, percent: 10 });
  const initial = queue.flush();
  queue.enqueue({ position: 400, percent: 40 });
  queue.enqueue({ position: 900, percent: 90 });
  const departure = queue.flush(true);
  assert.equal(calls.length, 1);
  first.resolve();
  await Promise.all([initial, departure]);
  assert.deepEqual(calls, [
    { position: 100, percent: 10, keepalive: false },
    { position: 900, percent: 90, keepalive: true },
  ]);
  assert.deepEqual(persisted.at(-1), { position: 900, percent: 90, pending: false });
  assert.equal(queue.hasPending(), false);
});

test("failure preserves local pending progress and retry sends it once", async () => {
  let fail = true;
  const stored = [];
  const errors = [];
  let saves = 0;
  const queue = createProgressSaveQueue({
    save: async () => { saves += 1; if (fail) throw new Error("offline"); },
    persist: (point, pending) => stored.push({ ...point, pending }),
    onError: (error) => errors.push(error.message),
  });
  queue.enqueue({ position: 700, percent: 70 });
  await queue.flush();
  assert.deepEqual(stored.at(-1), { position: 700, percent: 70, pending: true });
  assert.equal(queue.hasPending(), true);
  assert.deepEqual(errors, ["offline"]);
  fail = false;
  await queue.flush();
  assert.equal(saves, 2);
  assert.equal(stored.at(-1).pending, false);
});

test("auth unmount closes the queue without launching a follow-up or overwriting newer local scope", async () => {
  const first = deferred();
  const saves = [];
  const stored = [];
  const queue = createProgressSaveQueue({ save: async (point) => { saves.push(point.position); await first.promise; }, persist: (point, pending) => stored.push({ ...point, pending }) });
  queue.enqueue({ position: 100, percent: 10 });
  const flight = queue.flush();
  queue.enqueue({ position: 800, percent: 80 });
  queue.close();
  first.resolve();
  await flight;
  await queue.flush();
  assert.deepEqual(saves, [100]);
  assert.deepEqual(stored.at(-1), { position: 800, percent: 80, pending: true });
});

test("opening then leaving an untouched resume does not enqueue or overwrite it", async () => {
  const local = record({ pending: false });
  const candidate = selectResumeProgress({ position: 700, percent: 70, updatedAt: new Date(2000).toISOString() }, local);
  assert.equal(candidate.percent, 70);
  let writes = 0;
  const queue = createProgressSaveQueue({ save: async () => { writes += 1; }, persist: () => { writes += 1; } });
  await queue.flush(true);
  assert.equal(writes, 0);
});

test("explicit read-from-start can replace prior progress with a saved zero", async () => {
  const saved = [];
  const queue = createProgressSaveQueue({ save: async (point) => saved.push(point), persist: () => {} });
  queue.enqueue({ position: 0, percent: 0 });
  await queue.flush();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].position, 0);
  assert.equal(saved[0].percent, 0);
});

test("guest/account progress remains isolated and no guest state is migrated implicitly", () => {
  const store = storage();
  writeLocalProgress(store, record({ scope: "guest", percent: 30 }));
  writeLocalProgress(store, record({ scope: "account:7", percent: 70 }));
  assert.equal(readLocalProgress(store, progressScope(), 11).percent, 30);
  assert.equal(readLocalProgress(store, progressScope(7), 11).percent, 70);
  assert.equal(readLocalProgress(store, progressScope(9), 11), null);
  assert.equal(readLocalProgress(store, progressScope(7), 12), null);
});

test("local versioned history is bounded and invalid persistent records are ignored", () => {
  const store = storage();
  for (let index = 1; index <= 120; index += 1) writeLocalProgress(store, record({ chapterId: index, updatedAt: 1000 + index }));
  assert.equal(readLocalProgress(store, "account:7", 1), null);
  assert.equal(readLocalProgress(store, "account:7", 120).percent, 70);
  assert.equal(JSON.parse([...store.values.values()][0]).entries.length, 100);
  writeLocalProgress(store, record({ percent: 200 }));
  assert.equal(readLocalProgress(store, "account:7", 11), null);
  store.setItem("web_novel_reading_progress_v1", "{invalid-json");
  assert.equal(readLocalProgress(store, "account:7", 11), null);
  store.setItem("web_novel_reading_progress_v1", JSON.stringify({ version: 999, entries: [record()] }));
  assert.equal(readLocalProgress(store, "account:7", 11), null);
});

test("blocked storage does not crash the reader", () => {
  const store = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readLocalProgress(store, "guest", 11), null);
  assert.doesNotThrow(() => writeLocalProgress(store, record()));
});

test("server progress wins except for a newer locally pending point", () => {
  const server = { position: 800, percent: 80, updatedAt: new Date(2000).toISOString() };
  assert.equal(selectResumeProgress(server, record({ updatedAt: 3000 })).percent, 70);
  assert.equal(selectResumeProgress(server, record({ updatedAt: 3000, pending: false })).percent, 80);
  assert.equal(selectResumeProgress(server, record({ updatedAt: 1000 })).percent, 80);
  assert.equal(selectResumeProgress(null, record()).percent, 70);
  assert.equal(selectResumeProgress({ position: 0, percent: 0, updatedAt: null }, null), null);
});

test("viewport measurements are bounded and a fully visible short chapter is complete", () => {
  assert.equal(measureReadingProgress({ scrollY: 0, contentTop: 300, contentHeight: 100, viewportHeight: 800 }).percent, 100);
  assert.equal(measureReadingProgress({ scrollY: 0, contentTop: 900, contentHeight: 100, viewportHeight: 800 }).percent, 0);
  assert.equal(measureReadingProgress({ scrollY: 0, contentTop: 300, contentHeight: 2000, viewportHeight: 800 }).percent, 0);
  assert.equal(measureReadingProgress({ scrollY: 99999, contentTop: 300, contentHeight: 2000, viewportHeight: 800 }).percent, 100);
  assert.equal(normalizePoint({ position: Infinity, percent: NaN }).percent, 0);
});

test("resume ratio survives font/layout height changes", () => {
  const top = resumeScrollPosition({ percent: 70, contentTop: 300, contentHeight: 4000, viewportHeight: 800 });
  const point = measureReadingProgress({ scrollY: top, contentTop: 300, contentHeight: 4000, viewportHeight: 800 });
  assert.ok(Math.abs(point.percent - 70) < 0.05);
});

test("ongoing scrollbar movement or inertia extends intent beyond the first 1.5 seconds", () => {
  let lastIntent = 100;
  for (const eventTime of [200, 800, 1400, 2000, 2600, 3200, 3800]) {
    const result = classifyReaderScroll(lastIntent, eventTime);
    assert.equal(result.userDriven, true);
    lastIntent = result.lastIntent;
  }
  assert.equal(lastIntent, 3800);
  assert.equal(classifyReaderScroll(lastIntent, 5400).userDriven, false);
});

test("passive restoration and ignored layout scrolls never create new input intent", () => {
  assert.equal(classifyReaderScroll(-Infinity, 1000).userDriven, false);
  const ignored = classifyReaderScroll(1000, 1100, 1300);
  assert.equal(ignored.userDriven, false);
  assert.equal(ignored.lastIntent, 1000);
  assert.equal(classifyReaderScroll(ignored.lastIntent, 2600, 1300).userDriven, false);
});
