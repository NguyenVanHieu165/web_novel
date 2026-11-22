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
}

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=60";

export default function HeroStoryCard({
  story,
  position,
  onClick,
}: HeroStoryCardProps) {
  const rating = story.diemDanhGiaTrungBinh
    ? parseFloat(story.diemDanhGiaTrungBinh.toString()).toFixed(1)
    : "5.0";

  const cover = story.anhBia || FALLBACK_COVER;
  const isCenter = position === "center";

  return (
    <article
      onClick={!isCenter ? onClick : undefined}
      className="relative h-[430px] w-[290px] overflow-hidden rounded-2xl select-none sm:h-[480px] sm:w-[330px] md:h-[510px] md:w-[350px] bg-slate-900"
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
        className="h-full w-full object-cover select-none pointer-events-none transition-transform duration-700 rounded-2xl"
        style={{ borderRadius: "1rem" }}
        loading="lazy"
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
        <div className="absolute top-4 left-4 z-20 transition-all duration-300">
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
        className={`absolute inset-x-0 bottom-0 p-5 sm:p-6 z-20 flex flex-col justify-end transition-all duration-500 ${
          isCenter
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-6 pointer-events-none"
        }`}
      >
        {/* Thể loại */}
        {story.genres && story.genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
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
        <h2 className="text-xl sm:text-2xl font-black text-white leading-snug line-clamp-2 drop-shadow-md">
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
            <span>{(story.soChuong || 0).toLocaleString()} chương</span>
          </span>
        </div>

        {/* Mô tả ngắn */}
        <p className="mt-2 text-xs text-slate-300 leading-relaxed line-clamp-2 drop-shadow">
          {story.moTa ||
            "Một tác phẩm hấp dẫn với nội dung lôi cuốn độc giả ngay từ những trang đầu tiên."}
        </p>

        {/* Nút thao tác */}
        <div className="flex items-center gap-2.5 mt-4">
          <Link
            href={`/truyen/${story.slug}`}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs sm:text-sm text-center rounded-xl shadow-lg shadow-blue-600/40 transition-all"
          >
            Đọc ngay
          </Link>
          <Link
            href={`/truyen/${story.slug}`}
            className="px-4 py-2.5 bg-white/15 hover:bg-white/25 active:scale-95 text-white font-medium text-xs sm:text-sm rounded-xl border border-white/20 backdrop-blur-md transition-all text-center"
          >
            Chi tiết
          </Link>
        </div>
      </div>
    </article>
  );
}
