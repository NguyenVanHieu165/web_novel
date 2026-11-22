"use client";

import { X } from "lucide-react";
import type { GenreItem } from "@/lib/queries/genre.query";
import type { StorySearchKey } from "@/lib/story-search";
import { useStorySearchNavigation } from "./StorySearchProvider";

const labels: Record<string, string> = {
  dang_tien_hanh: "Đang ra", hoan_thanh: "Hoàn thành", tam_dung: "Tạm dừng", sap_ra_mat: "Sắp ra mắt",
  luotXem: "Xem nhiều", moiNhat: "Mới nhất", capNhat: "Cập nhật", danhGia: "Đánh giá cao",
  "duoi-100": "Dưới 100 chương", "100-500": "100–500 chương", "tren-500": "Trên 500 chương",
  mien_phi: "Miễn phí", vip: "VIP",
};

export default function ActiveStoryFilters({ genres = [] }: { genres?: GenreItem[] }) {
  const { params, query, pending, controller } = useStorySearchNavigation();
  const filters: Array<{ key: StorySearchKey; label: string }> = [];
  if (query.q) filters.push({ key: "q", label: `Từ khóa: ${query.q}` });
  if (query.author) filters.push({ key: "author", label: `Tác giả: ${query.author}` });
  if (params.has("theLoai") && query.theLoai) filters.push({ key: "theLoai", label: genres.find((genre) => genre.slug === query.theLoai)?.tenTheLoai ?? query.theLoai });
  for (const key of ["trangThai", "sapXep", "soChuong", "vip"] as const) {
    if (params.has(key)) filters.push({ key, label: labels[query[key]] ?? query[key] });
  }
  return (
    <div className="space-y-2">
      {filters.length > 0 && <div role="group" aria-label="Bộ lọc đang áp dụng" className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => <button key={filter.key} type="button" aria-label={`Bỏ bộ lọc ${filter.label}`}
          onClick={() => controller.update({ [filter.key]: undefined })}
          className="inline-flex max-w-full items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/60">
          <span className="truncate">{filter.label}</span><X className="h-3 w-3 shrink-0" aria-hidden="true" />
        </button>)}
        <button type="button" onClick={() => controller.clear()} className="rounded px-2 py-1.5 text-xs font-semibold text-slate-600 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300">Xóa tất cả bộ lọc</button>
      </div>}
      <p role="status" aria-live="polite" className="min-h-5 text-xs text-slate-500 dark:text-zinc-400">{pending ? "Đang cập nhật kết quả…" : ""}</p>
    </div>
  );
}
