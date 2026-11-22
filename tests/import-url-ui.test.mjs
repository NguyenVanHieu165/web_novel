import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { terminal } from "../lib/scraper/types.ts";

const loadModule = createRequire(import.meta.url);
const source = await readFile(new URL("../components/stories/ImportUrlModal.tsx", import.meta.url), "utf8");
const componentModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, {
  module: componentModule, exports: componentModule.exports,
  require(name) {
    if (name === "@/lib/scraper/types") return { terminal };
    if (name === "@/components/ui/input") return { Input: props => React.createElement("input", props) };
    if (name === "@/components/ui/button") return { Button: ({ children, ...props }) => { delete props.variant; delete props.size; return React.createElement("button", props, children); } };
    return loadModule(name);
  },
});
const { ImportOptionsForm, ImportProgress } = componentModule.exports;
const options = { url: "https://lohi2.com/truyen/kiem-lai", downloadImages: true, skipExisting: true, skipLocked: true };
const job = { id: "fixture", status: "completed", storyTitle: "Kiếm Lai", totalChapters: 5, processedChapters: 5, savedChapters: 5, skippedChapters: 0, lockedChapters: 0, failedChapters: 0, downloadedImages: 1, logs: [], options };

test("the default form explicitly selects all public chapters and disables the numeric cap", () => {
  const html = renderToStaticMarkup(React.createElement(ImportOptionsForm, { initialOptions: null, starting: false, onStart: async () => {} }));
  assert.match(html, /name="chapterScope" checked="" value="all"/);
  assert.match(html, /<input(?=[^>]*name="maxChapters")(?=[^>]*disabled="")[^>]*>/);
  assert.match(html, /Bắt đầu lấy toàn bộ chương/);
  assert.match(html, /Website yêu cầu đăng nhập, trả phí/);
  assert.match(html, /<fieldset[^>]*><legend[^>]*>Phạm vi lấy chương/);
});
test("a limited retry restores the source URL and chapter cap without claiming all chapters", () => {
  const html = renderToStaticMarkup(React.createElement(ImportOptionsForm, { initialOptions: { ...options, maxChapters: 7 }, starting: false, onStart: async () => {} }));
  assert.match(html, /name="chapterScope" checked="" value="limited"/);
  assert.match(html, /<input(?=[^>]*name="maxChapters")(?=[^>]*required="")(?=[^>]*value="7")[^>]*>/);
  assert.match(html, /value="https:\/\/lohi2.com\/truyen\/kiem-lai"/);
  assert.match(html, />Bắt đầu Import<|Bắt đầu Import<\/button>/);
});
test("progress labels scope completion separately from source completeness and displays actionable failures", () => {
  const html = renderToStaticMarkup(React.createElement(ImportProgress, { job: { ...job, status: "partial", options: { ...options, maxChapters: 5 }, sourceTotalChapters: 1000, catalogueComplete: false, errorCode: "CATALOGUE_INCOMPLETE", error: "Mục lục dừng ở trang 2. Hãy thử lại sau.", issues: [{ chapter: 6, code: "SOURCE_LOCKED", reason: "Chương cần đăng nhập." }] } }, React.createElement("button", null, "Tiếp tục chương còn thiếu")));
  assert.match(html, /Phạm vi: tối đa 5 chương/);
  assert.match(html, /Nguồn công bố 1000 chương/);
  assert.match(html, /không bảo đảm đã có mọi chương/);
  assert.match(html, /Mục lục dừng ở trang 2/);
  assert.match(html, /CATALOGUE_INCOMPLETE/);
  assert.match(html, /Chương 6: Chương cần đăng nhập/);
  assert.match(html, /role="log" aria-live="off"/);
});
test("an interrupted identification has no misleading zero-of-zero progress and keeps recovery controls", () => {
  const html = renderToStaticMarkup(React.createElement(ImportProgress, { job: { ...job, status: "interrupted", totalChapters: 0, processedChapters: 0, sourceName: "LoHi", sourceUrl: options.url, options: { ...options, maxChapters: 7 }, catalogueComplete: undefined, error: "Server khởi động lại." } }, React.createElement("button", null, "Tiếp tục chương còn thiếu")));
  assert.match(html, /Phiên import bị gián đoạn/);
  assert.doesNotMatch(html, /<progress|0\/0/);
  assert.match(html, /Chưa đọc được mục lục/);
  assert.match(html, /Tiếp tục chương còn thiếu/);
  assert.match(html, /LoHi/);
  assert.match(html, /Phạm vi: tối đa 7 chương/);
  assert.match(html, /Phiên dài có thể chia theo thời gian chạy/);
  assert.doesNotMatch(html, /Đã hoàn tất phạm vi import|đã lấy đủ tất cả/i);
});
