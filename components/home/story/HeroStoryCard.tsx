import Image from "next/image";
import Link from "next/link";
import { Star, BookOpen, Flame } from "lucide-react";

export interface HeroStoryData {
  idTruyen: number;
  tenTruyen: string;
  slug: string;
  anhBia: string;
  moTa?: string | null;
  soChuong?: number | null;
  diemDanhGiaTrungBinh?: string | number | null;
  luotXem?: number | null;
  genres?: string[];
}

interface HeroStoryCardProps {
  story: HeroStoryData;
  position: "left" | "center" | "right" | "hidden";
  onClick?: () => void;
  priority?: boolean;
}

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=60";

export default function HeroStoryCard({
  story,
  position,
  onClick,
  priority = false,
}: HeroStoryCardProps) {
  const rating = story.diemDanhGiaTrungBinh
    ? parseFloat(story.diemDanhGiaTrungBinh.toString()).toFixed(1)
    : "5.0";

  const cover = story.anhBia || FALLBACK_COVER;
  const isCenter = position === "center";

  return (
    <article
      onClick={!isCenter ? onClick : undefined}
      className="relative h-full w-full select-none overflow-hidden rounded-2xl bg-slate-900"
      style={{
        borderRadius: "1rem",
        WebkitMaskImage: "-webkit-radial-gradient(white, black)",
      }}
    >
      {/* 1. Ảnh bìa truyện tràn viền - bo cong đồng bộ 100% với khung thẻ */}
      <Image
        fill
        unoptimized
        sizes="(min-width: 768px) 350px, (min-width: 640px) 330px, 290px"
        src={cover}
        alt={story.tenTruyen}
        className="pointer-events-none h-full w-full select-none rounded-2xl object-cover transition-transform duration-700"
        style={{ borderRadius: "1rem" }}
        priority={priority}
        decoding="async"
      />

      {/* 2. Lớp phủ Gradient: Card bên hông mờ nhẹ, card giữa tối dần về đáy để đọc chữ */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 pointer-events-none rounded-2xl ${
          isCenter
            ? "bg-gradient-to-t from-black/95 via-black/40 to-transparent"
            : "bg-black/25"
        }`}
        style={{ borderRadius: "1rem" }}
      />

      {/* 3. Badge "ĐANG HOT" - Luôn hiển thị trên card giữa */}
      {isCenter && (
        <div className="absolute left-4 top-4 z-20 transition-[transform,opacity] duration-300">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-rose-600 text-white text-[11px] font-bold rounded-full uppercase tracking-wider shadow-md shadow-rose-900/30">
            <Flame className="w-3.5 h-3.5 fill-white" />
            Đang Hot
          </span>
        </div>
      )}

      {/* 4. Tên truyện ngắn gọn trên các card phụ (Bên trái / phải) */}
      {!isCenter && (
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <h3 className="text-sm font-bold text-white/90 line-clamp-1 text-center drop-shadow">
            {story.tenTruyen}
          </h3>
        </div>
      )}

      {/* 5. Khối nội dung chi tiết CHỈ HIỆN Ở CARD GIỮA */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-5 transition-[transform,opacity] duration-500 sm:p-6 ${
          isCenter
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-6 pointer-events-none"
        }`}
      >
        {/* Thể loại */}
        {story.genres && story.genres.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {story.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-white/15 text-white/90 backdrop-blur-md"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Tiêu đề truyện */}
        <h2 className="line-clamp-2 text-xl font-black leading-snug text-white drop-shadow-md sm:text-2xl">
          {story.tenTruyen}
        </h2>

        {/* Chỉ số đánh giá & số chương */}
        <div className="flex items-center gap-3 mt-2 text-xs sm:text-sm text-slate-200">
          <span className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="font-bold text-amber-400">{rating}</span>
          </span>
          <span className="text-white/40">•</span>
          <span className="flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>{(story.soChuong || 0).toLocaleString("vi-VN")} chương</span>
          </span>
        </div>

        {/* Mô tả ngắn */}
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300 drop-shadow">
          {story.moTa ||
            "Một tác phẩm hấp dẫn với nội dung lôi cuốn độc giả ngay từ những trang đầu tiên."}
        </p>

        {/* Nút thao tác */}
        <div className="flex items-center gap-2.5 mt-4">
          <Link
            href={`/truyen/${story.slug}`}
            prefetch={isCenter}
            tabIndex={isCenter ? undefined : -1}
            className="flex-1 touch-manipulation rounded-xl bg-blue-600 py-2 text-center text-xs font-bold text-white shadow-lg shadow-blue-600/40 transition-[transform,background-color] hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:scale-95 sm:py-2.5 sm:text-sm"
          >
            Đọc ngay
          </Link>
          <Link
            href={`/truyen/${story.slug}`}
            prefetch={isCenter}
            tabIndex={isCenter ? undefined : -1}
            className="touch-manipulation rounded-xl border border-white/20 bg-white/15 px-4 py-2 text-center text-xs font-medium text-white backdrop-blur-md transition-[transform,background-color] hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:scale-95 sm:py-2.5 sm:text-sm"
          >
            Chi tiết
          </Link>
        </div>
      </div>
    </article>
  );
}
