"use client";

import { X } from "lucide-react";
import type { GenreItem } from "@/lib/queries/genre.query";
import type { StorySearchKey } from "@/lib/story-search";
import { useStorySearchNavigation } from "./StorySearchProvider";
import { Button } from "@/components/ui/button";

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
        {filters.map((filter) => <Button key={filter.key} type="button" size="xs" variant="secondary" aria-label={`Bỏ bộ lọc ${filter.label}`}
            onClick={() => controller.update({ [filter.key]: undefined })}
            className="max-w-full gap-2 rounded-full bg-info/10 px-3 text-info hover:bg-info/15">
            <span className="truncate">{filter.label}</span><X className="size-3 shrink-0" aria-hidden="true" />
          </Button>)}
        <Button type="button" variant="link" size="xs" onClick={() => controller.clear()}>Xóa tất cả bộ lọc</Button>
      </div>}
      <p role="status" aria-live="polite" className="min-h-5 text-xs text-muted-foreground">{pending ? "Đang cập nhật kết quả…" : ""}</p>
    </div>
  );
}
