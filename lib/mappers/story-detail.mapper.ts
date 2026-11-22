export interface ChapterItemData {
  idChuong: number;
  chuongSo: number;
  tieuDeChuong: string;
  slug: string;
  isFree: boolean;
  giaXu: number;
  luotXem: number;
  updatedAt: string;
}

export interface ReviewItemData {
  idDanhGia: number;
  soSao: number;
  noiDung: string;
  createdAt: string;
  authorName: string;
  authorAvatar?: string | null;
}

export interface CommentItemData {
  idBinhLuan: number;
  noiDung: string;
  likeCount: number;
  createdAt: string;
  authorName: string;
  authorAvatar?: string | null;
  isStoryAuthor?: boolean;
  replyTo?: number | null;
}

export interface StoryDetailData {
  idTruyen: number;
  tenTruyen: string;
  slug: string;
  anhBia: string;
  anhThumbnail?: string | null;
  moTa: string;
  trang_thai: string;
  luotXem: number;
  luotTheoDoi: number;
  soChuong: number;
  diemDanhGiaTrungBinh: number;
  soLuotDanhGia: number;
  genres: Array<{ idTheLoai: number; tenTheLoai: string }>;
  chapters: ChapterItemData[];
  reviews: ReviewItemData[];
  comments: CommentItemData[];
  firstChapterSlug: string | null;
  latestChapterSlug: string | null;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function mapStoryDetail(rawStory: Awaited<ReturnType<typeof getStoryDetailBySlug>>): StoryDetailData | null {
  if (!rawStory) return null;

  const chapters: ChapterItemData[] = rawStory.chuong.map((c) => ({
    idChuong: c.idChuong,
    chuongSo: c.chuongSo ? Number(c.chuongSo) : 1,
    tieuDeChuong: c.tieuDeChuong || `Chương ${c.chuongSo}`,
    slug: c.slug,
    isFree: Boolean(c.isFree ?? true),
    giaXu: c.giaXu || 0,
    luotXem: c.luotXem || 0,
    updatedAt: formatDate(c.updatedAt),
  }));

  const reviews: ReviewItemData[] = rawStory.danhGiaTruyen.map((r) => ({
    idDanhGia: r.idDanhGia,
    soSao: r.soSao || 5,
    noiDung: r.noiDung || "",
    createdAt: formatDate(r.createdAt),
    authorName: r.taiKhoan?.hoSoCaNhan?.ho_ten || r.taiKhoan?.tenTaiKhoan || "Độc giả",
    authorAvatar: r.taiKhoan?.hoSoCaNhan?.anh || null,
  }));

  const comments: CommentItemData[] = rawStory.binh_luan.map((cm) => ({
    idBinhLuan: cm.idBinhLuan,
    noiDung: cm.noiDung || "",
    likeCount: cm.likeCount || 0,
    createdAt: formatDate(cm.createdAt),
    authorName: cm.taiKhoan?.hoSoCaNhan?.ho_ten || cm.taiKhoan?.tenTaiKhoan || "Độc giả",
    authorAvatar: cm.taiKhoan?.hoSoCaNhan?.anh || null,
    isStoryAuthor: cm.isStoryAuthor,
  }));

  const genres = rawStory.truyenTheLoai
    .map((item) => ({
      idTheLoai: item.theLoai?.idTheLoai,
      tenTheLoai: item.theLoai?.tenTheLoai,
    }))
    .filter((g) => Boolean(g.idTheLoai && g.tenTheLoai));

  const ratingAvg = rawStory.diemDanhGiaTrungBinh
    ? parseFloat(rawStory.diemDanhGiaTrungBinh.toString())
    : 0;

  return {
    idTruyen: rawStory.idTruyen,
    tenTruyen: rawStory.tenTruyen,
    slug: rawStory.slug,
    anhBia: rawStory.anhBia || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&auto=format&fit=crop&q=60",
    anhThumbnail: rawStory.anhThumbnail || null,
    moTa: rawStory.moTa || "Chưa có mô tả tóm tắt cho tác phẩm này.",
    trang_thai: rawStory.trang_thai || "dang_tien_hanh",
    luotXem: rawStory.luotXem || 0,
    luotTheoDoi: rawStory._count?.theoDoiTruyen ?? rawStory.luotTheoDoi ?? 0,
    soChuong: rawStory._count?.chuong ?? rawStory.soChuong ?? chapters.length,
    diemDanhGiaTrungBinh: Number(ratingAvg.toFixed(1)),
    soLuotDanhGia: rawStory._count?.danhGiaTruyen ?? rawStory.soLuotDanhGia ?? reviews.length,
    genres,
    chapters,
    reviews,
    comments,
    firstChapterSlug: rawStory.firstChapter?.slug ?? null,
    latestChapterSlug: chapters[0]?.slug ?? null,
  };
}
import type { getStoryDetailBySlug } from "@/lib/queries/story-detail.query";

