import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routeModule = { exports: {} };
const source = await readFile(new URL("../lib/continue-reading-state.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: routeModule, exports: routeModule.exports, require: createRequire(import.meta.url) });
const { readContinueReading, writeContinueReading, selectLatestContinueReading } = routeModule.exports;

function storage() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function entry(overrides = {}) {
  return {
    storySlug: "tac-pham", chapterId: 11, chapterNumber: 11, chapterSlug: "chuong-11",
    chapterTitle: "Chương mười một", position: 300, percent: 32.5, updatedAt: 1_000,
    ...overrides,
  };
}

test("continue-reading keeps the newest chapter per story", () => {
  const store = storage();
  writeContinueReading(store, entry());
  writeContinueReading(store, entry({ chapterId: 12, chapterNumber: 12, chapterSlug: "chuong-12", updatedAt: 2_000 }));
  assert.equal(readContinueReading(store, "tac-pham").chapterNumber, 12);
  assert.equal(JSON.parse([...store.values.values()][0]).entries.length, 1);
});

test("continue-reading history is bounded to 50 recent stories", () => {
  const store = storage();
  for (let index = 1; index <= 60; index += 1) {
    writeContinueReading(store, entry({ storySlug: `story-${index}`, chapterId: index, updatedAt: index }));
  }
  assert.equal(readContinueReading(store, "story-1"), null);
  assert.equal(readContinueReading(store, "story-60").chapterId, 60);
  assert.equal(JSON.parse([...store.values.values()][0]).entries.length, 50);
});

test("invalid, corrupt, or blocked storage never breaks reading", () => {
  const store = storage();
  writeContinueReading(store, entry({ percent: 101 }));
  assert.equal(readContinueReading(store, "tac-pham"), null);
  store.setItem("web_novel_continue_reading_v1", "{invalid-json");
  assert.equal(readContinueReading(store, "tac-pham"), null);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readContinueReading(blocked, "tac-pham"), null);
  assert.doesNotThrow(() => writeContinueReading(blocked, entry()));
});

test("newest timestamp wins during local/server reconciliation", () => {
  const local = entry({ updatedAt: 2_000 });
  const server = entry({ chapterId: 12, chapterNumber: 12, updatedAt: 3_000 });
  assert.equal(selectLatestContinueReading(local, server).chapterId, 12);
  assert.equal(selectLatestContinueReading(local, { ...server, updatedAt: 1_000 }).chapterId, 11);
  assert.equal(selectLatestContinueReading(local, null).chapterId, 11);
  assert.equal(selectLatestContinueReading(null, server).chapterId, 12);
});
