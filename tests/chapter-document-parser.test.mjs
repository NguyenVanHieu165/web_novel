import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { parseChapterDocument, cleanWritingText, splitChapterDocument, MAX_CHAPTER_DOCUMENT_BYTES } from "../lib/chapter-document-parser.ts";
const require = createRequire(import.meta.url);
const JSZip = require("jszip");
function file(name, text) { const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8"); return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; }
async function wordDocument(paragraphs) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
test("TXT UTF-8 BOM / NFD and attached spacing accents normalize before split", async () => {
  const parsed = await parseChapterDocument(file("truyen.txt", "\uFEFFChương 1: Hắn\r\nHă´n   đê´n.\r\n\r\n\r\nChương 2: Luồng\r\nluô`ng  gió"));
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.chapters[0].chuongSo, 1);
  assert.equal(parsed.chapters[0].tieuDeChuong, "Chương 1: Hắn");
  assert.equal(parsed.chapters[0].noiDung, "Hắn đến.");
  assert.equal(parsed.chapters[1].noiDung, "luồng gió");
  assert.equal(parsed.text, parsed.text.normalize("NFC"));
});
test("Markdown and Hồi chapter headings split with decimal numbers and preserve paragraphs", async () => {
  const parsed = await parseChapterDocument(file("viet.MD", "Lời mở đầu\n\n# Chương 1: Gặp gỡ\nĐoạn một.\n\nĐoạn hai.\n\n**Hồi 2.5: Trở về**\nKết thúc."));
  assert.deepEqual(parsed.chapters.map(chapter => chapter.chuongSo), [1, 2.5]);
  assert.equal(parsed.chapters[0].noiDung, "Đoạn một.\n\nĐoạn hai.");
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.text, /^Lời mở đầu/);
});
test("DOCX extracts actual Word text with chapter splits and NFC", async () => {
  const document = await wordDocument(["Chương 1: Mở đầu", "Tiếng Việt đầu tiên.", "Chương 2: Kết thúc", "Đây là toàn bộ đoạn cuối."]);
  const parsed = await parseChapterDocument(file("ban-thao.docx", document));
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.chapters[0].noiDung, "Tiếng Việt đầu tiên.");
  assert.equal(parsed.chapters[1].noiDung, "Đây là toàn bộ đoạn cuối.");
});
test("one file without chapter heading preserves full text and proposes filename title", async () => {
  const parsed = await parseChapterDocument(file("Bản thảo.txt", "Đoạn đầu\n\nĐoạn cuối"));
  assert.equal(parsed.chapters.length, 1);
  assert.equal(parsed.chapters[0].tieuDeChuong, "Bản thảo");
  assert.equal(parsed.chapters[0].noiDung, parsed.text);
  assert.equal(cleanWritingText("  a\t b\n\n\n c  "), "a b\n\nc");
});
test("unsupported, oversized, empty, binary and invalid UTF8 documents fail safely", async () => {
  await assert.rejects(() => parseChapterDocument(file("bad.exe", "a")), /Chỉ hỗ trợ/);
  await assert.rejects(() => parseChapterDocument({ name: "large.docx", size: MAX_CHAPTER_DOCUMENT_BYTES + 1, arrayBuffer() { throw Error("must not read oversized file"); } }), /10 MB/);
  await assert.rejects(() => parseChapterDocument(file("empty.txt", "")), /rỗng/);
  await assert.rejects(() => parseChapterDocument(file("bad.txt", Buffer.from([0xff, 0xfe, 0xfd]))), /UTF-8/);
  await assert.rejects(() => parseChapterDocument(file("binary.md", "a\0b")), /UTF-8/);
  await assert.rejects(() => parseChapterDocument(file("broken.docx", "this is not docx")), /DOCX/);
});
test("duplicate numbers and empty chapters are explicit preview warnings; huge split is bounded", () => {
  const parsed = splitChapterDocument("Chương 1: A\n\nChương 1: B\nNội dung");
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.warnings.length, 2);
  assert.throws(() => splitChapterDocument(Array.from({ length: 501 }, (_, i) => `Chương ${i + 1}: A\nNội dung`).join("\n")), /500 chương/);
});
