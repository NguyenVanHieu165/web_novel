import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(await readFile(
  new URL("../lib/reader-navigation.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(onLeaving = () => {}) {
  const routeModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: routeModule,
    exports: routeModule.exports,
    setTimeout,
    clearTimeout,
    CustomEvent,
    window: { dispatchEvent: onLeaving },
  });
  return routeModule.exports;
}

test("plain arrow keys choose an ordered adjacent chapter", () => {
  const { readerKeyboardDirection } = harness();
  assert.equal(readerKeyboardDirection({ key: "ArrowLeft" }), "previous");
  assert.equal(readerKeyboardDirection({ key: "ArrowRight" }), "next");
  assert.equal(readerKeyboardDirection({ key: "ArrowUp" }), null);
  assert.equal(readerKeyboardDirection({ key: "Enter" }), null);
});

test("all reader destinations encode route segments consistently", () => {
  const { getStoryPath, getChapterPath } = harness();
  const story = "Truyện / có ? và #";
  const chapter = "chương 12/ngoại-truyện?#";
  assert.equal(getStoryPath(story), `/truyen/${encodeURIComponent(story)}`);
  assert.equal(getChapterPath(story, chapter), `/truyen/${encodeURIComponent(story)}/${encodeURIComponent(chapter)}`);
  assert.equal(getChapterPath("sample-story", "chuong-1"), "/truyen/sample-story/chuong-1");
});

test("chapter reader paths are distinguished from story and non-reader pages", () => {
  const { isChapterPath } = harness();
  assert.equal(isChapterPath("/truyen/sample-story/chuong-1"), true);
  assert.equal(isChapterPath("/truyen/sample-story/chuong-1/"), true);
  assert.equal(isChapterPath("/truyen/sample-story"), false);
  assert.equal(isChapterPath("/tim-kiem"), false);
});

test("typing, dialogs, modifiers, key repeat and composition never trigger navigation", () => {
  const { readerKeyboardDirection } = harness();
  for (const property of ["interactive", "blocked", "defaultPrevented", "repeat", "isComposing", "altKey", "ctrlKey", "metaKey", "shiftKey"]) {
    assert.equal(readerKeyboardDirection({ key: "ArrowRight", [property]: true }), null, property);
  }
});

test("only a plain primary click is intercepted for the progress-aware SPA transition", () => {
  const { shouldHandleReaderClick } = harness();
  assert.equal(shouldHandleReaderClick({ button: 0 }), true);
  assert.equal(shouldHandleReaderClick({ button: 0, target: "_self" }), true);
  for (const input of [
    { button: 1 }, { button: 2 }, { button: 0, target: "_blank" }, { button: 0, target: "reading-window" },
    { button: 0, download: true }, { button: 0, defaultPrevented: true },
    ...["altKey", "ctrlKey", "metaKey", "shiftKey"].map((property) => ({ button: 0, [property]: true })),
  ]) assert.equal(shouldHandleReaderClick(input), false, JSON.stringify(input));
});

test("departure event identifies the source chapter and waits for registered progress", async () => {
  let settle;
  let completed = false;
  const flush = new Promise((resolve) => { settle = resolve; });
  const { waitForReaderLeave } = harness((event) => {
    assert.equal(event.type, "reader-leaving");
    assert.equal(event.detail.chapterId, 17);
    event.detail.waitUntil(flush);
  });
  const leaving = waitForReaderLeave(17).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  settle();
  await leaving;
  assert.equal(completed, true);
});

test("failed progress writes cannot trap the reader on the chapter", async () => {
  const { waitForReaderLeave } = harness((event) => {
    event.detail.waitUntil(Promise.reject(new Error("Connection interrupted")));
  });
  await assert.doesNotReject(waitForReaderLeave(17));
});

test("a stalled progress request has a bounded wait", async () => {
  const { waitForReaderLeave } = harness((event) => {
    event.detail.waitUntil(new Promise(() => {}));
  });
  await assert.doesNotReject(waitForReaderLeave(17, 5));
});

test("no registered progress work proceeds without a timeout", async () => {
  const { waitForReaderLeave } = harness();
  await waitForReaderLeave(17);
});
