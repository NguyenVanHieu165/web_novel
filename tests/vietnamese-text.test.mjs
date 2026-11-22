import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { normalizeVietnameseText } from "../lib/vietnamese-text.ts";
import { normalizeVietnameseText as fromUtils } from "../lib/utils.ts";
import { normalizeVietnamese as fromCodec } from "../scripts/crawl-source-codec.ts";

test("spacing accents and NFD normalize to the requested Vietnamese words", () => {
  for (const [broken, fixed] of [
    ["thiê´t", "thiết"], ["đê´n", "đến"], ["luô`ng", "luồng"],
    ["Hă´n nă´m chặt nă´m đâ´m", "Hắn nắm chặt nắm đấm"],
    ["thie\u02c6\u00b4t", "thiết"], ["ma\u02dc", "mã"],
    ["a\u0301\u0306", "ắ"], ["a\u0306\u0301", "ắ"], ["á´", "á"],
    ["Tiếng Việt".normalize("NFD"), "Tiếng Việt"],
  ]) assert.equal(normalizeVietnameseText(broken), fixed);
});

test("shared utility and crawler use one normalizer", () => {
  assert.equal(fromUtils, normalizeVietnameseText);
  assert.equal(fromCodec, normalizeVietnameseText);
});

test("every Vietnamese vowel/tone survives NFC, NFD and repeat normalization", () => {
  const vowels = "aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ";
  for (const char of [...vowels + vowels.toUpperCase()]) {
    assert.equal(normalizeVietnameseText(char.normalize("NFD")), char);
    assert.equal(normalizeVietnameseText(normalizeVietnameseText(char)), char);
  }
  assert.equal(normalizeVietnameseText("dấu ´ ` ˆ ˜ đứng riêng; 😀\nDòng hai"), "dấu ´ ` ˆ ˜ đứng riêng; 😀\nDòng hai");
});

test("chapter render repairs attached accents while escaping markup", async () => {
  const require = createRequire(import.meta.url);
  const source = await readFile(new URL("../components/chapter/ChapterText.tsx", import.meta.url), "utf8");
  const componentModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: componentModule, exports: componentModule.exports, require(name) { return name === "@/lib/utils" ? { normalizeVietnameseText } : require(name); },
  });
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.ChapterText, { content: "thiê´t luô`ng Hă´n\n<script>text</script>" }));
  assert.match(html, /thiết luồng Hắn/);
  assert.match(html, /&lt;script&gt;text&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("chapter images render only generated local paths and never remote or active HTML", async () => {
  const loadModule = createRequire(import.meta.url);
  const source = await readFile(new URL("../components/chapter/ChapterText.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const componentModule = { exports: {} };
  vm.runInNewContext(compiled, { module: componentModule, exports: componentModule.exports, require(name) { return name === "@/lib/utils" ? { normalizeVietnameseText } : loadModule(name); } });
  const content = `<img src="/uploads/chapters/story/${"a".repeat(64)}.webp" alt="Hình" />\n<img src="https://evil.example/image.jpg" onerror="alert(1)" />`;
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.ChapterText, { content }));
  assert.match(html, /<img[^>]+src="\/uploads\/chapters\/story\//);
  assert.match(html, /&lt;img src=/);
  assert.doesNotMatch(html, /<img[^>]+src="https:\/\/evil/);
});
