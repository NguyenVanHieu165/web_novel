import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getStoryList } from "@/lib/queries/story-list.query";
import { Trophy, Flame, Star, Sparkles, ChevronRight, Eye } from "lucide-react";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Bảng Xếp Hạng Truyện Chữ Hay Nhất | WebNovel",
  description:
    "Vinh danh các tác phẩm truyện chữ xuất sắc nhất theo lượt xem, điểm số đánh giá và độ phổ biến trên WebNovel.",
};

interface XepHangPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function XepHangPage({ searchParams }: XepHangPageProps) {
  const resolvedSearchParams = await searchParams;
  const tab = resolvedSearchParams.tab;
  const currentTab = tab === "ratings" || tab === "new" ? tab : "views";

  let sapXep: "luotXem" | "danhGia" | "moiNhat" = "luotXem";
  if (currentTab === "ratings") sapXep = "danhGia";
  else if (currentTab === "new") sapXep = "moiNhat";

  const { items } = await getStoryList({
    sapXep,
    page: 1,
    limit: 30,
  });

  const top3 = items.slice(0, 3);
  const remaining = items.slice(3);

  const TABS = [
    { key: "views", label: "Top Lượt Xem", icon: Flame },
    { key: "ratings", label: "Top Đánh Giá", icon: Star },
    { key: "new", label: "Top Mới Nổi", icon: Sparkles },
  ];

  return (
    <div className="space-y-10 pb-16">
      {/* Header & Breadcrumb */}
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400"
        >
          <Link href="/" className="hover:text-blue-600 transition-colors">
            Trang chủ
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-800 dark:text-zinc-200">
            Bảng xếp hạng
          </span>
        </nav>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-indigo-950 p-8 sm:p-10 border border-amber-500/20 text-white shadow-xl">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Điện thờ danh vọng</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white">
              Bảng Xếp Hạng Tác Phẩm
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Bảng xếp hạng vinh danh những bộ truyện xuất sắc nhất, thu hút hàng triệu độc giả đồng hành mỗi ngày.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-zinc-800/80 pb-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/xep-hang?tab=${tab.key}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                isActive
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-slate-200/80 dark:border-zinc-800/80"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Top 3 Podium Cards */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {top3.map((story, idx) => {
            const rank = idx + 1;
            const rankColors = [
              "from-amber-400 to-amber-600 text-slate-950 shadow-amber-500/30 border-amber-300", // #1 Gold
              "from-slate-200 to-slate-400 text-slate-900 shadow-slate-400/30 border-slate-200", // #2 Silver
              "from-amber-700 to-orange-800 text-white shadow-orange-700/30 border-amber-600", // #3 Bronze
            ];
            const borderColors = [
              "border-amber-400/50 hover:border-amber-400",
              "border-slate-300/60 dark:border-zinc-700/60 hover:border-slate-400",
              "border-orange-500/40 hover:border-orange-500",
            ];

            return (
              <Link
                key={story.idTruyen}
                href={`/truyen/${story.slug}`}
                className={`group relative flex flex-col p-5 rounded-3xl bg-white dark:bg-zinc-900/60 border ${borderColors[idx]} shadow-lg transition-all duration-300 hover:-translate-y-1.5`}
              >
                {/* Rank Badge */}
                <div
                  className={`absolute -top-3.5 left-6 w-9 h-9 rounded-2xl bg-gradient-to-br ${rankColors[idx]} font-black text-base flex items-center justify-center shadow-lg border-2`}
                >
                  #{rank}
                </div>

                <div className="flex gap-4 items-center pt-2">
                  <div className="relative w-20 h-28 sm:w-24 sm:h-32 shrink-0 rounded-2xl overflow-hidden shadow-md">
                    <Image
                      fill
                      unoptimized
                      loading="eager"
                      sizes="(min-width: 640px) 96px, 80px"
                      src={story.anhBia || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400"}
                      alt={story.tenTruyen}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {story.genres?.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                        >
                          {g}
                        </span>
                      ))}
                    </div>

                    <h3 className="font-bold text-base text-slate-900 dark:text-zinc-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {story.tenTruyen}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 pt-1">
                      <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-300">
                        <Eye className="w-3.5 h-3.5 text-blue-500" />
                        {story.luotXem?.toLocaleString() ?? 0}
                      </span>
                      {story.diemDanhGiaTrungBinh && (
                        <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {parseFloat(story.diemDanhGiaTrungBinh.toString()).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Ranks 4 to 30 Table List */}
      {remaining.length > 0 && (
        <div className="bg-white dark:bg-zinc-900/60 rounded-3xl border border-slate-200/80 dark:border-zinc-800/80 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
            <h2 className="font-bold text-base text-slate-800 dark:text-zinc-200">
              Thứ Hạng Tiếp Theo (Từ Hạng 4)
            </h2>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800/60">
            {remaining.map((story, idx) => {
              const rank = idx + 4;
              return (
                <Link
                  key={story.idTruyen}
                  href={`/truyen/${story.slug}`}
                  className="group flex items-center gap-4 sm:gap-6 p-4 sm:p-5 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="w-8 text-center font-black text-slate-400 dark:text-zinc-500 group-hover:text-blue-600 text-base sm:text-lg">
                    {rank}
                  </div>

                  <div className="relative w-12 h-16 sm:w-14 sm:h-20 shrink-0 rounded-xl overflow-hidden shadow-sm">
                    <Image
                      fill
                      unoptimized
                      loading="eager"
                      sizes="(min-width: 640px) 56px, 48px"
                      src={story.anhBia || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400"}
                      alt={story.tenTruyen}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                      {story.tenTruyen}
                    </h4>

                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {story.genres?.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400"
                        >
                          {g}
                        </span>
                      ))}
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        {story.soChuong ?? 0} chương
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right space-y-1">
                    <div className="flex items-center justify-end gap-1 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                      <span>{story.luotXem?.toLocaleString() ?? 0}</span>
                    </div>
                    {story.diemDanhGiaTrungBinh && (
                      <div className="flex items-center justify-end gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{parseFloat(story.diemDanhGiaTrungBinh.toString()).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
