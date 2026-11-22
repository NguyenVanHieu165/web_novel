import Link from "next/link";
import {
  Swords,
  Heart,
  Wand2,
  Clock,
  RotateCcw,
  Sword,
  Building2,
  Gamepad2,
  Cpu,
  ScrollText,
  Ghost,
  Skull,
} from "lucide-react";
import SectionHeader from "@/components/common/SectionHeader";

const GENRES = [
  { label: "Tiên Hiệp", href: "/the-loai/tien-hiep", count: 1245, icon: Wand2, color: "from-violet-500 to-purple-600" },
  { label: "Kiếm Hiệp", href: "/the-loai/kiem-hiep", count: 874, icon: Sword, color: "from-blue-500 to-cyan-500" },
  { label: "Ngôn Tình", href: "/the-loai/ngon-tinh", count: 632, icon: Heart, color: "from-pink-500 to-rose-500" },
  { label: "Huyền Huyễn", href: "/the-loai/huyen-huyen", count: 958, icon: Swords, color: "from-amber-500 to-orange-500" },
  { label: "Xuyên Không", href: "/the-loai/xuyen-khong", count: 510, icon: Clock, color: "from-teal-500 to-emerald-500" },
  { label: "Trọng Sinh", href: "/the-loai/trong-sinh", count: 420, icon: RotateCcw, color: "from-green-500 to-lime-500" },
  { label: "Đô Thị", href: "/the-loai/do-thi", count: 734, icon: Building2, color: "from-slate-500 to-slate-700" },
  { label: "Võng Du", href: "/the-loai/vong-du", count: 385, icon: Gamepad2, color: "from-indigo-500 to-blue-600" },
  { label: "Hệ Thống", href: "/the-loai/he-thong", count: 290, icon: Cpu, color: "from-cyan-500 to-blue-500" },
  { label: "Lịch Sử", href: "/the-loai/lich-su", count: 215, icon: ScrollText, color: "from-yellow-600 to-amber-600" },
  { label: "Tâm Linh", href: "/the-loai/tam-linh", count: 178, icon: Ghost, color: "from-fuchsia-500 to-violet-500" },
  { label: "Kinh Dị", href: "/the-loai/kinh-di", count: 143, icon: Skull, color: "from-red-600 to-red-800" },
];

export default function GenreExplorer() {
  return (
    <section>
      <SectionHeader title="Khám phá thể loại" href="/the-loai" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {GENRES.map((genre) => (
          <Link
            key={genre.href}
            href={genre.href}
            className="group relative flex flex-col items-center gap-2 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-100 dark:border-zinc-800/80 shadow-xs hover:shadow-md hover:-translate-y-0.5 hover:border-blue-200 dark:hover:border-zinc-700 transition-all duration-200 overflow-hidden"
          >
            {/* Background gradient on hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${genre.color} opacity-0 group-hover:opacity-5 transition-opacity duration-200`} />

            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${genre.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200`}>
              <genre.icon className="w-5 h-5 text-white" strokeWidth={1.8} />
            </div>

            {/* Label */}
            <span className="font-semibold text-xs text-slate-700 dark:text-zinc-200 text-center leading-tight">
              {genre.label}
            </span>

            {/* Count */}
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
              {genre.count.toLocaleString()} truyện
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
