import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(await readFile(
  new URL("../lib/reader-typography-anchor.ts", import.meta.url), "utf8",
), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helperModule = { exports: {} };
vm.runInNewContext(compiled, { module: helperModule, exports: helperModule.exports });
const { findReaderTypographyAnchor, readerTypographyScrollTop } = helperModule.exports;

test("captures the current paragraph and relative location inside it", () => {
  const anchor = findReaderTypographyAnchor({
    count: 3,
    readRect: (index) => [{ top: -200, bottom: -100 }, { top: -80, bottom: 120 }, { top: 140, bottom: 340 }][index],
    articleRect: { top: -200, bottom: 340 },
    viewportHeight: 700,
  });
  assert.equal(anchor.index, 1);
  assert.equal(anchor.fraction, 0.8);
  assert.equal(anchor.viewportY, 80);
});

test("reflows keep the same fractional passage beneath the sticky header", () => {
  const top = readerTypographyScrollTop({
    anchor: { index: 1, fraction: 0.8, viewportY: 80 },
    paragraphRect: { top: 40, bottom: 340 },
    scrollTop: 500,
    maxScrollTop: 3000,
  });
  assert.equal(top, 700);
});

test("when the reading line is between paragraphs, preserve the next paragraph's offset", () => {
  const anchor = findReaderTypographyAnchor({
    count: 2,
    readRect: (index) => [{ top: -80, bottom: 60 }, { top: 100, bottom: 300 }][index],
    articleRect: { top: -80, bottom: 300 },
    viewportHeight: 700,
  });
  assert.equal(anchor.index, 1);
  assert.equal(anchor.fraction, 0);
  assert.equal(anchor.viewportY, 100);
});

test("skips an article before reading begins, above viewport, or too short", () => {
  for (const articleRect of [{ top: 400, bottom: 800 }, { top: -400, bottom: -10 }, { top: 0, bottom: 60 }]) {
    assert.equal(findReaderTypographyAnchor({
      count: 1, readRect: () => articleRect, articleRect, viewportHeight: 700,
    }), null);
  }
  assert.equal(findReaderTypographyAnchor({
    count: 0, readRect: () => { throw new Error("No children must not be read"); },
    articleRect: { top: 0, bottom: 300 }, viewportHeight: 700,
  }), null);
});

test("uses logarithmic geometry reads for long chapters", () => {
  let reads = 0;
  const anchor = findReaderTypographyAnchor({
    count: 4096,
    readRect: (index) => { reads += 1; return { top: index * 100 - 204800, bottom: index * 100 - 204700 }; },
    articleRect: { top: -204800, bottom: 204800 },
    viewportHeight: 700,
  });
  assert.equal(anchor.index, 2048);
  assert.ok(reads <= 13, `Expected at most 13 reads, got ${reads}`);
});

test("restoration clamps to document bounds and leaves a short page at its top", () => {
  const anchor = { index: 0, fraction: 0.5, viewportY: 80 };
  assert.equal(readerTypographyScrollTop({ anchor, paragraphRect: { top: -400, bottom: -200 }, scrollTop: 0, maxScrollTop: 1000 }), 0);
  assert.equal(readerTypographyScrollTop({ anchor, paragraphRect: { top: 400, bottom: 600 }, scrollTop: 900, maxScrollTop: 1000 }), 1000);
  assert.equal(readerTypographyScrollTop({ anchor, paragraphRect: { top: 100, bottom: 200 }, scrollTop: 0, maxScrollTop: -300 }), 0);
});
