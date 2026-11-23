"use client";

import { Filter, Sparkles, Flame, Clock, Star } from "lucide-react";
import { useStorySearchNavigation } from "@/components/search/StorySearchProvider";
import { FilterBar, FilterBarGroup } from "@/components/shared/filter-bar";
import { Button } from "@/components/ui/button";

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
export default function StoryListFilter({ fixedStatus }: { fixedStatus?: "hoan_thanh" }) {
  const { query, controller } = useStorySearchNavigation();
  return (
    <FilterBar className="block space-y-4 rounded-2xl bg-card/70 p-4 backdrop-blur-md sm:p-5">
      <fieldset className="space-y-3 border-b pb-4">
        <legend className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Filter className="size-3.5" aria-hidden="true" />Sắp xếp theo</legend>
        <div className="flex flex-wrap gap-2">
          {sorts.map(({ value, label, icon: Icon }) => <Button key={value} type="button" size="sm"
            variant={query.sapXep === value ? "default" : "outline"} aria-pressed={query.sapXep === value}
            onClick={() => controller.update({ sapXep: value })} className="rounded-xl">
            <Icon aria-hidden="true" />{label}
          </Button>)}
        </div>
      </fieldset>
      <FilterBarGroup className="grid gap-4 lg:grid-cols-3">
        {fixedStatus ? <p className="self-center text-sm text-muted-foreground">Trạng thái: <strong className="text-foreground">Đã hoàn thành</strong></p> : (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">Trạng thái</legend>
            <div className="flex flex-wrap gap-2">{statuses.map(({ value, label }) => <Button key={value} type="button" size="sm" variant={query.trangThai === value ? "default" : "outline"} aria-pressed={query.trangThai === value}
              onClick={() => controller.update({ trangThai: value })} className="rounded-xl">{label}</Button>)}</div>
          </fieldset>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Số chương</legend>
          <div className="flex flex-wrap gap-2">{chapterCounts.map(({ value, label }) => <Button key={value} type="button" size="sm" variant={query.soChuong === value ? "default" : "outline"} aria-pressed={query.soChuong === value}
            onClick={() => controller.update({ soChuong: value })} className="rounded-xl">{label}</Button>)}</div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Loại truyện</legend>
          <div className="flex flex-wrap gap-2">{vipOptions.map(({ value, label }) => <Button key={value} type="button" size="sm" variant={query.vip === value ? "default" : "outline"} aria-pressed={query.vip === value}
            onClick={() => controller.update({ vip: value })} className="rounded-xl">{label}</Button>)}</div>
        </fieldset>
      </FilterBarGroup>
    </FilterBar>
  );
}
