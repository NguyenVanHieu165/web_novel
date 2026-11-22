import type { Metadata } from "next";
import Link from "next/link";
import { getAllGenresWithCount } from "@/lib/queries/genre.query";
import { Layers, ChevronRight } from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Tất Cả Thể Loại Truyện | WebNovel",
  description:
    "Khám phá danh sách đầy đủ các thể loại truyện chữ: Tiên Hiệp, Kiếm Hiệp, Ngôn Tình, Đô Thị, Huyền Huyễn, Khoa Huyễn...",
};

export default async function GenresIndexPage() {
  const genres = await getAllGenresWithCount();
  const totalStories = genres.reduce((acc, g) => acc + g.storyCount, 0);

  return (
    <div className="space-y-10 pb-16">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-8 sm:p-12 text-white border border-slate-800 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Layers className="w-3.5 h-3.5" />
            <span>Phân loại thư viện</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
            Danh Mục Thể Loại
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Hàng ngàn tác phẩm được tuyển chọn kỹ lưỡng qua {genres.length} thể loại phong phú. Dễ dàng tìm kiếm thế giới kỳ ảo phù hợp nhất với sở thích của bạn.
          </p>
          <div className="flex items-center gap-6 pt-2 text-xs sm:text-sm text-slate-400">
            <div>
              <span className="font-bold text-white text-base mr-1">{genres.length}</span> Thể loại
            </div>
            <div className="w-1 h-1 rounded-full bg-slate-600" />
            <div>
              <span className="font-bold text-white text-base mr-1">{totalStories}</span> Tác phẩm
            </div>
          </div>
        </div>
      </div>

      {/* Genres Grid */}
      <section className="space-y-6">
        <SectionHeader title="Tất Cả Thể Loại" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {genres.map((genre) => (
            <Link
              key={genre.idTheLoai}
              href={`/the-loai/${genre.slug}`}
              className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800/80 hover:border-blue-500/60 dark:hover:border-blue-500/50 shadow-sm hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base text-slate-800 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {genre.tenTheLoai}
                  </h3>
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40">
                    {genre.storyCount} truyện
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                  {genre.moTa || `Danh sách các tác phẩm đặc sắc thuộc thể loại ${genre.tenTheLoai}.`}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-100 dark:border-zinc-800/60 text-xs font-medium text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                <span>Xem danh sách</span>
                <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
