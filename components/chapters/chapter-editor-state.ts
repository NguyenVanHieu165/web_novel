import { normalizeVietnameseText, slugify } from "@/lib/utils";

export type WritingChapter = {
  idChuong?: number;
  idTruyen: number;
  chuongSo: number;
  tieuDeChuong: string;
  slug: string;
  noiDung: string;
  isFree: boolean;
  giaXu: number;
  publication: "draft" | "published";
};

export function cleanWritingText(value: string) {
  return normalizeVietnameseText(value).replace(/\r\n?/g, "\n")
    .replace(/[\t \u00a0]+/g, " ").replace(/^ +| +$/gm, "").replace(/ +([,.;!?…:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function writingStatistics(value: string) {
  const text = value.trim();
  const words = text ? text.split(/\s+/u).length : 0;
  return { words, characters: [...value].length, paragraphs: text ? text.split(/\n+/).filter(paragraph => paragraph.trim()).length : 0, minutes: words ? Math.ceil(words / 250) : 0 };
}

export function writingDraftKey(accountId: number, storyId: number, chapterId?: number) {
  return `story-writing:v1:${accountId}:${storyId}:${chapterId ?? "new"}`;
}

export function decodeWritingDraft(raw: string | null): { value: WritingChapter; savedAt: number } | null {
  if (!raw || raw.length > 5_000_000) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("value" in data) || !("savedAt" in data) || typeof data.savedAt !== "number") return null;
    const value = data.value;
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    if (typeof item.idTruyen !== "number" || typeof item.chuongSo !== "number" || !Number.isFinite(item.chuongSo) || typeof item.tieuDeChuong !== "string" || typeof item.slug !== "string" || typeof item.noiDung !== "string" || typeof item.giaXu !== "number" || !Number.isInteger(item.giaXu) || item.giaXu < 0 || typeof item.isFree !== "boolean" || !["draft", "published"].includes(String(item.publication)) || (item.idChuong !== undefined && typeof item.idChuong !== "number")) return null;
    return { value: item as WritingChapter, savedAt: data.savedAt };
  } catch { return null; }
}

export function emptyWritingChapter(idTruyen: number, chuongSo = 1): WritingChapter {
  return { idTruyen, chuongSo, tieuDeChuong: "", slug: "", noiDung: "", isFree: true, giaXu: 0, publication: "draft" };
}

export function chapterTitleSlug(number: number, title: string) {
  return slugify(`chuong-${number}-${title}`).slice(0, 300);
}

export function singleDocumentChapter(text: string) {
  const cleaned = cleanWritingText(text).replace(/^\uFEFF/, "");
  const lines = cleaned.split("\n");
  const first = (lines[0] ?? "").replace(/^#{1,6}\s+/, "").replace(/^\*\*(.*?)\*\*$/, "$1").trim();
  const match = /^(?:Chương|Hồi)\s+(\d+(?:[.,]\d)?)(?=\s|[:.\-–—]|$)/iu.exec(first);
  return match ? { chuongSo: Number(match[1].replace(",", ".")), tieuDeChuong: first, noiDung: lines.slice(1).join("\n").trim() }
    : { chuongSo: 1, tieuDeChuong: "", noiDung: cleaned };
}
