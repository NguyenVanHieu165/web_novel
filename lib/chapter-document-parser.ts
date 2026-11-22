import { normalizeVietnameseText } from "./vietnamese-text";
import { slugify } from "./utils";
import { inflateRawSync } from "node:zlib";

export const MAX_CHAPTER_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_CHAPTERS = 500;
const MAX_EXPANDED_BYTES = 40 * 1024 * 1024;

export class ChapterDocumentError extends Error {
  constructor(message: string, public code = "INVALID_DOCUMENT", public status = 400) { super(message); }
}
export type ParsedDocumentChapter = { chuongSo: number; tieuDeChuong: string; slug: string; noiDung: string };
export type ParsedChapterDocument = { text: string; chapters: ParsedDocumentChapter[]; warnings: string[] };
export type ChapterDocumentFile = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

export function cleanWritingText(text: string): string {
  return normalizeVietnameseText(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
    .replace(/[\t \u00a0]+/g, " ").replace(/^ +| +$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function heading(line: string) {
  const cleaned = line.replace(/^#{1,6}\s+/, "").replace(/^\*\*(.*?)\*\*$/, "$1").trim();
  const match = /^(?:Chương|Hồi)\s+(\d+(?:[.,]\d)?)(?=\s|[:.\-–—]|$)/iu.exec(cleaned);
  if (!match) return null;
  return { chuongSo: Number(match[1].replace(",", ".")), tieuDeChuong: cleaned };
}

export function splitChapterDocument(text: string, fileName = "Chương mới"): ParsedChapterDocument {
  const cleaned = cleanWritingText(text);
  if (!cleaned) throw new ChapterDocumentError("File không có nội dung văn bản.");
  if (Buffer.byteLength(cleaned, "utf8") > MAX_CHAPTER_DOCUMENT_BYTES) throw new ChapterDocumentError("Văn bản sau trích xuất vượt quá 10 MB.", "DOCUMENT_TOO_LARGE", 413);
  const lines = cleaned.split("\n");
  const starts = lines.flatMap((line, index) => { const value = heading(line); return value ? [{ index, ...value }] : []; });
  if (starts.length > MAX_DOCUMENT_CHAPTERS) throw new ChapterDocumentError(`Mỗi lần import tối đa ${MAX_DOCUMENT_CHAPTERS} chương. Hãy chia nhỏ file.`, "TOO_MANY_CHAPTERS");
  const warnings: string[] = [];
  let chapters: ParsedDocumentChapter[];
  if (starts.length) {
    if (starts[0].index > 0) warnings.push("Phần mở đầu trước tiêu đề chương đầu tiên không nằm trong danh sách tách chương; vẫn có trong chế độ nạp một chương.");
    chapters = starts.map((item, index) => ({
      chuongSo: item.chuongSo, tieuDeChuong: item.tieuDeChuong,
      slug: slugify(item.tieuDeChuong) || `chuong-${item.chuongSo}`,
      noiDung: lines.slice(item.index + 1, starts[index + 1]?.index ?? lines.length).join("\n").trim(),
    }));
    if (chapters.some((chapter) => !chapter.noiDung)) warnings.push("Có chương chưa có nội dung. Bỏ chọn hoặc bổ sung trước khi import.");
    if (new Set(chapters.map((chapter) => chapter.chuongSo)).size !== chapters.length) warnings.push("File có số chương trùng nhau. Chỉnh lại số chương trước khi import.");
  } else {
    const title = cleanWritingText(fileName.replace(/\.[^.]+$/, "")) || "Chương mới";
    chapters = [{ chuongSo: 1, tieuDeChuong: title, slug: slugify(title) || "chuong-1", noiDung: cleaned }];
    warnings.push("Không tìm thấy tiêu đề Chương/Hồi. File được nạp thành một chương; bạn có thể đổi số chương.");
  }
  return { text: cleaned, chapters, warnings };
}

// Validate the ZIP directory before Mammoth inflates DOCX members. No file is extracted to disk.
function validateDocxArchive(buffer: Buffer) {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new ChapterDocumentError("File DOCX không hợp lệ hoặc đã hỏng.");
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50 && index + 22 + buffer.readUInt16LE(index + 20) === buffer.length) { end = index; break; }
  }
  if (end < 0) throw new ChapterDocumentError("Không đọc được cấu trúc DOCX.");
  const entries = buffer.readUInt16LE(end + 10), length = buffer.readUInt32LE(end + 12), start = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || entries !== buffer.readUInt16LE(end + 8) || entries > 2048 || entries === 0xffff || start + length > end) throw new ChapterDocumentError("DOCX nhiều phần/ZIP64 hoặc quá nhiều thành phần không được hỗ trợ.");
  let offset = start, expanded = 0, hasDocument = false;
  const names = new Set<string>(), localOffsets = new Set<number>();
  const ranges: Array<{ start: number; end: number }> = [];
  const invalid = () => new ChapterDocumentError("Cấu trúc hoặc dữ liệu DOCX không hợp lệ.");
  const tooLarge = () => new ChapterDocumentError("DOCX sau giải nén vượt quá giới hạn 40 MB.", "DOCUMENT_TOO_LARGE", 413);
  const crcTable = Array.from({ length: 256 }, (_, value) => {
    let remainder = value;
    for (let bit = 0; bit < 8; bit++) remainder = remainder & 1 ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
    return remainder >>> 0;
  });
  function crc32(bytes: Buffer) {
    let value = 0xffffffff;
    for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }
  function validateExtra(begin: number, byteLength: number) {
    const stop = begin + byteLength;
    while (begin < stop) {
      if (begin + 4 > stop) throw invalid();
      const tag = buffer.readUInt16LE(begin), size = buffer.readUInt16LE(begin + 2);
      // These fields can override the sizes/paths that were validated above.
      if (tag === 0x0001 || tag === 0x7075 || begin + 4 + size > stop) throw invalid();
      begin += 4 + size;
    }
  }
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > start + length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new ChapterDocumentError("Mục lục DOCX bị hỏng.");
    const flags = buffer.readUInt16LE(offset + 8), method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extra + comment;
    if (next > start + length || local + 30 > start || buffer.readUInt32LE(local) !== 0x04034b50 || flags & ~0x080e || ![0, 8].includes(method) || size === 0xffffffff || compressed === 0xffffffff || buffer.readUInt16LE(offset + 34)) throw new ChapterDocumentError("DOCX mã hóa hoặc cấu trúc không được hỗ trợ.");
    const localNameLength = buffer.readUInt16LE(local + 26), localExtraLength = buffer.readUInt16LE(local + 28);
    const payload = local + 30 + localNameLength + localExtraLength;
    if (payload + compressed > start) throw new ChapterDocumentError("Dữ liệu DOCX bị thiếu.");
    if (buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method || localNameLength !== nameLength ||
      !buffer.subarray(local + 30, local + 30 + localNameLength).equals(buffer.subarray(offset + 46, offset + 46 + nameLength))) throw invalid();
    validateExtra(offset + 46 + nameLength, extra);
    validateExtra(local + 30 + localNameLength, localExtraLength);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || name.split("/").some(part => part === "..") || names.has(name) || localOffsets.has(local)) throw invalid();
    names.add(name); localOffsets.add(local);
    if (expanded + size > MAX_EXPANDED_BYTES) throw tooLarge();
    let bytes: Buffer;
    try {
      // Never trust the directory's expanded size: cap the actual inflater output.
      bytes = method === 8 ? inflateRawSync(buffer.subarray(payload, payload + compressed), {
        maxOutputLength: Math.max(1, Math.min(size, MAX_EXPANDED_BYTES - expanded)),
      }) : buffer.subarray(payload, payload + compressed);
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ERR_BUFFER_TOO_LARGE") throw tooLarge();
      throw invalid();
    }
    if (bytes.length !== size || crc32(bytes) !== buffer.readUInt32LE(offset + 16)) throw invalid();
    expanded += bytes.length;
    let memberEnd = payload + compressed;
    if (flags & 8) {
      if (memberEnd + 12 > start) throw invalid();
      if (buffer.readUInt32LE(memberEnd) === 0x08074b50) memberEnd += 4;
      if (memberEnd + 12 > start || buffer.readUInt32LE(memberEnd) !== buffer.readUInt32LE(offset + 16) ||
        buffer.readUInt32LE(memberEnd + 4) !== compressed || buffer.readUInt32LE(memberEnd + 8) !== size) throw invalid();
      memberEnd += 12;
    } else if (buffer.readUInt32LE(local + 14) !== buffer.readUInt32LE(offset + 16) ||
      buffer.readUInt32LE(local + 18) !== compressed || buffer.readUInt32LE(local + 22) !== size) throw invalid();
    ranges.push({ start: local, end: memberEnd });
    if (name === "word/document.xml") hasDocument = true;
    offset = next;
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end)) throw invalid();
  if (offset !== start + length || !hasDocument) throw new ChapterDocumentError("File không chứa tài liệu Word hợp lệ.");
}

export async function parseChapterDocument(file: ChapterDocumentFile): Promise<ParsedChapterDocument> {
  const extension = /\.(docx|txt|md)$/i.exec(file.name)?.[1].toLowerCase();
  if (!extension) throw new ChapterDocumentError("Chỉ hỗ trợ file .docx, .txt hoặc .md.", "UNSUPPORTED_DOCUMENT", 415);
  if (!file.size) throw new ChapterDocumentError("File rỗng.");
  if (file.size > MAX_CHAPTER_DOCUMENT_BYTES) throw new ChapterDocumentError("File không được vượt quá 10 MB.", "DOCUMENT_TOO_LARGE", 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size || buffer.length > MAX_CHAPTER_DOCUMENT_BYTES) throw new ChapterDocumentError("Kích thước file không hợp lệ.", "DOCUMENT_TOO_LARGE", 413);
  let text: string;
  if (extension === "docx") {
    validateDocxArchive(buffer);
    try {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } catch { throw new ChapterDocumentError("Không trích xuất được văn bản DOCX. Hãy lưu lại file bằng Word hoặc LibreOffice."); }
  } else {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { throw new ChapterDocumentError("File TXT/Markdown cần được lưu ở mã hóa UTF-8.", "INVALID_ENCODING"); }
    if (text.includes("\0")) throw new ChapterDocumentError("File không phải văn bản UTF-8 hợp lệ.");
  }
  return splitChapterDocument(text, file.name);
}
