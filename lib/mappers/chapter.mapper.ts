import type { getChapterDetail } from "@/lib/queries/chapter.query";
import { normalizeVietnameseText } from "@/lib/vietnamese-text";

type ChapterQueryResult = NonNullable<Awaited<ReturnType<typeof getChapterDetail>>>;

export interface NavChapterItem {
  slug: string;
  tieuDeChuong: string;
  chuongSo: number;
}

export interface DrawerChapterItem {
  idChuong: number;
  chuongSo: number;
  tieuDeChuong: string;
  slug: string;
  isFree: boolean;
  giaXu: number;
}

export interface ChapterDetailData {
  story: {
    idTruyen: number;
    tenTruyen: string;
    slug: string;
    anhBia: string;
  };
  chapter: {
    idChuong: number;
    chuongSo: number;
    tieuDeChuong: string;
    slug: string;
    isFree: boolean;
    giaXu: number;
    noiDung: string;
  };
  access: ChapterQueryResult["access"];
  prevChapter: NavChapterItem | null;
  nextChapter: NavChapterItem | null;
  allChapters: DrawerChapterItem[];
}

export function mapChapterDetail(raw: ChapterQueryResult): ChapterDetailData {
  const current = raw.currentChapter;
  const content = current.noiDungChuong?.noiDung || "Nội dung chương này đang được cập nhật.";

  return {
    story: {
      idTruyen: raw.story.idTruyen,
      tenTruyen: normalizeVietnameseText(raw.story.tenTruyen),
      slug: raw.story.slug,
      anhBia: raw.story.anhBia || "",
    },
    chapter: {
      idChuong: current.idChuong,
      chuongSo: Number(current.chuongSo),
      tieuDeChuong: normalizeVietnameseText(current.tieuDeChuong || `Chương ${current.chuongSo}`),
      slug: current.slug,
      isFree: Boolean(current.isFree ?? true),
      giaXu: current.giaXu || 0,
      noiDung: content,
    },
    access: raw.access,
    prevChapter: raw.prevChapter
      ? {
          slug: raw.prevChapter.slug,
          tieuDeChuong: normalizeVietnameseText(raw.prevChapter.tieuDeChuong),
          chuongSo: Number(raw.prevChapter.chuongSo),
        }
      : null,
    nextChapter: raw.nextChapter
      ? {
          slug: raw.nextChapter.slug,
          tieuDeChuong: normalizeVietnameseText(raw.nextChapter.tieuDeChuong),
          chuongSo: Number(raw.nextChapter.chuongSo),
        }
      : null,
    allChapters: [],
  };
}
