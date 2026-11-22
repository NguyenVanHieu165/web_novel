"use client";

import { Filter, Sparkles, Flame, Clock, Star } from "lucide-react";
import { useStorySearchNavigation } from "@/components/search/StorySearchProvider";

const sorts = [
  { label: "Xem nhiều", value: "luotXem", icon: Flame },
  { label: "Mới nhất", value: "moiNhat", icon: Sparkles },
  { label: "Cập nhật", value: "capNhat", icon: Clock },
  { label: "Đánh giá", value: "danhGia", icon: Star },
] as const;
const statuses = [
  { label: "Tất cả", value: "tat_ca" }, { label: "Đang ra", value: "dang_tien_hanh" },
  { label: "Hoàn thành", value: "hoan_thanh" }, { label: "Tạm dừng", value: "tam_dung" },
  { label: "Sắp ra mắt", value: "sap_ra_mat" },
] as const;
const chapterCounts = [
  { label: "Tất cả", value: "all" }, { label: "< 100", value: "duoi-100" },
  { label: "100–500", value: "100-500" }, { label: "> 500", value: "tren-500" },
] as const;
const vipOptions = [
  { label: "Tất cả", value: "tat_ca" }, { label: "Miễn phí", value: "mien_phi" }, { label: "VIP", value: "vip" },
] as const;
const optionClass = (active: boolean) => `rounded-xl border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${active
  ? "border-blue-600 bg-blue-600 text-white"
  : "border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-600"}`;

export default function StoryListFilter({ fixedStatus }: { fixedStatus?: "hoan_thanh" }) {
  const { query, controller } = useStorySearchNavigation();
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-md sm:p-5 dark:border-zinc-800/80 dark:bg-zinc-900/60">
      <fieldset className="space-y-3 border-b border-slate-100 pb-4 dark:border-zinc-800">
        <legend className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400"><Filter className="h-3.5 w-3.5" aria-hidden="true" />Sắp xếp theo</legend>
        <div className="flex flex-wrap gap-2">
          {sorts.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={query.sapXep === value}
            onClick={() => controller.update({ sapXep: value })} className={`flex items-center gap-1.5 ${optionClass(query.sapXep === value)}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
          </button>)}
        </div>
      </fieldset>
      <div className="grid gap-4 lg:grid-cols-3">
        {fixedStatus ? <p className="self-center text-sm text-slate-600 dark:text-zinc-300">Trạng thái: <strong>Đã hoàn thành</strong></p> : (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Trạng thái</legend>
            <div className="flex flex-wrap gap-2">{statuses.map(({ value, label }) => <button key={value} type="button" aria-pressed={query.trangThai === value}
              onClick={() => controller.update({ trangThai: value })} className={optionClass(query.trangThai === value)}>{label}</button>)}</div>
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Số chương</legend>
          <div className="flex flex-wrap gap-2">{chapterCounts.map(({ value, label }) => <button key={value} type="button" aria-pressed={query.soChuong === value}
            onClick={() => controller.update({ soChuong: value })} className={optionClass(query.soChuong === value)}>{label}</button>)}</div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-slate-500 dark:text-zinc-400">Loại truyện</legend>
          <div className="flex flex-wrap gap-2">{vipOptions.map(({ value, label }) => <button key={value} type="button" aria-pressed={query.vip === value}
            onClick={() => controller.update({ vip: value })} className={optionClass(query.vip === value)}>{label}</button>)}</div>
        </fieldset>
      </div>
    </div>
  );
}
