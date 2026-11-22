import assert from "node:assert/strict";
import test from "node:test";
import { cleanWritingText, writingStatistics, writingDraftKey, decodeWritingDraft, emptyWritingChapter, chapterTitleSlug, singleDocumentChapter } from "../components/chapters/chapter-editor-state.ts";
import { loadNotificationModule } from "./notification-support.mjs";

test("writing cleanup repairs Vietnamese spacing accents and paragraph whitespace", () => {
  assert.equal(cleanWritingText("  Hă´n\t đê´n  đây.\r\n\r\n\r\n  Tiếng Việt.  "), "Hắn đến đây.\n\nTiếng Việt.");
  const clean = cleanWritingText("Tiếng Việt".normalize("NFD"));
  assert.equal(clean, clean.normalize("NFC"));
});

test("writing statistics count Unicode characters and estimate 250 words per minute", () => {
  assert.deepEqual(writingStatistics(""), { words: 0, characters: 0, paragraphs: 0, minutes: 0 });
  assert.deepEqual(writingStatistics("Xin chào.\n\nMột dòng 😀"), { words: 5, characters: 21, paragraphs: 2, minutes: 1 });
  assert.equal(writingStatistics(Array(251).fill("chữ").join(" ")).minutes, 2);
});

test("local drafts are separated by account, story and chapter with strict decoding", () => {
  assert.notEqual(writingDraftKey(1, 10), writingDraftKey(2, 10));
  assert.notEqual(writingDraftKey(1, 10), writingDraftKey(1, 11));
  assert.notEqual(writingDraftKey(1, 10), writingDraftKey(1, 10, 1));
  const value = { ...emptyWritingChapter(10), noiDung: "Bản nháp" };
  assert.deepEqual(decodeWritingDraft(JSON.stringify({ version: 1, value, savedAt: 100 })), { value, savedAt: 100 });
  for (const raw of ["not json", JSON.stringify({ version: 2, value, savedAt: 1 }), JSON.stringify({ version: 1, value: { ...value, giaXu: -1 }, savedAt: 1 }), JSON.stringify({ version: 1, value: { ...value, publication: "invalid" }, savedAt: 1 })]) assert.equal(decodeWritingDraft(raw), null);
});

test("chapter slugs include chapter number and normalize Vietnamese", () => {
  assert.equal(chapterTitleSlug(2, "Hă´n đến"), "chuong-2-han-den");
  assert.notEqual(chapterTitleSlug(1, "Mở đầu"), chapterTitleSlug(2, "Mở đầu"));
});

test("single-file import preserves preface and later headings without duplicating first heading", () => {
  assert.deepEqual(singleDocumentChapter("Lời mở đầu\n\nChương 1: Bình minh\nNội dung"), { chuongSo: 1, tieuDeChuong: "", noiDung: "Lời mở đầu\n\nChương 1: Bình minh\nNội dung" });
  assert.deepEqual(singleDocumentChapter("\n# Chương 2: Bình minh\nNội dung 2\n\nChương 3: Đêm\nNội dung 3"), { chuongSo: 2, tieuDeChuong: "Chương 2: Bình minh", noiDung: "Nội dung 2\n\nChương 3: Đêm\nNội dung 3" });
  assert.equal(singleDocumentChapter("Bản thảo không có tiêu đề").tieuDeChuong, "");
});

test("collaborative content preserves the current seed until a live editor is ready", () => {
  const refs = [];
  const exports = loadNotificationModule("hooks/useCollaborativeEditor.ts", {
    react: { useState: value => [value, () => {}], useMemo: callback => callback(), useEffect: () => {}, useRef: value => { const ref = { current: value }; refs.push(ref); return ref; } },
    "socket.io-client": { io() { throw new Error("This regression must not open a socket"); } },
    yjs: {}, codemirror: { EditorView: { theme: () => ({}) }, basicSetup: [] },
    "@codemirror/state": {}, "y-codemirror.next": {}, "y-protocols/awareness": {},
  });
  const { getContent } = exports.useCollaborativeEditor({ chapterId: 1, enabled: true, initialContent: "Bản thảo chưa kết nối", userName: "Tác giả", editorContainerRef: { current: null } });
  assert.equal(getContent(), "Bản thảo chưa kết nối", "autosave and disabling collaboration must preserve text when the server is unavailable");
  refs[1].current = { state: { doc: { toString: () => "Nội dung cập nhật tức thì" } } };
  assert.equal(getContent(), "Nội dung cập nhật tức thì");
  refs[1].current = { state: { doc: { toString: () => "" } } };
  assert.equal(getContent(), "", "an explicitly emptied live document must not resurrect the seed");
});
