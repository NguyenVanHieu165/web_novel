"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { defaultAdminStoryQuery, type AdminStoryQuery } from "@/schemas/admin-story-query.schema";
import type { StoryGenre } from "./useAdminStories";

type Props = { query: AdminStoryQuery; setQuery: (query: AdminStoryQuery) => void; genres: StoryGenre[] };
const controlClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function StoryToolbar({ query, setQuery, genres }: Props) {
  const [search, setSearch] = useState(query.q);
  const [source, setSource] = useState(query.q);
  if (source !== query.q) { setSource(query.q); setSearch(query.q); }
  const applySearch = useEffectEvent((q: string) => setQuery({ ...query, q, page: 1 }));
  useEffect(() => {
    if (search === query.q) return;
    const timeout = window.setTimeout(() => applySearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search, query.q]);
  const change = (patch: Partial<AdminStoryQuery>) => setQuery({ ...query, ...patch, page: 1 });
  return (
    <section aria-label="Bộ lọc truyện" className="grid grid-cols-1 items-end gap-3 rounded-lg border bg-card p-3 text-card-foreground sm:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1 text-sm sm:col-span-2">
        <span>Tìm truyện hoặc tác giả</span>
        <span className="relative block">
          <Input name="q" autoComplete="off" maxLength={100} className="h-10 pr-10" placeholder="Nhập tên truyện hoặc tác giả…" value={search} onChange={(event) => setSearch(event.target.value)} />
          {search && <Button type="button" variant="ghost" size="icon" aria-label="Xóa tìm kiếm" className="absolute right-0 top-0 h-10 w-10" onClick={() => { setSearch(""); change({ q: "" }); }}><X aria-hidden="true" className="h-4 w-4" /></Button>}
        </span>
      </label>
      <label className="space-y-1 text-sm"><span>Số chương</span>
        <select name="chapterRange" className={controlClass} value={query.chapterRange} onChange={(event) => change({ chapterRange: event.target.value as AdminStoryQuery["chapterRange"] })}>
          <option value="all">Tất cả số chương</option><option value="empty">0 chương</option><option value="1-20">1–20 chương</option><option value="21-100">21–100 chương</option><option value="100+">Trên 100 chương</option>
        </select>
      </label>
      <label className="space-y-1 text-sm"><span>Thể loại</span>
        <select name="genreId" className={controlClass} value={query.genreId ?? query.genre ?? "all"} onChange={(event) => change({ genreId: event.target.value === "all" ? undefined : Number(event.target.value), genre: undefined })}>
          <option value="all">Tất cả thể loại</option>
          {query.genre && <option value={query.genre}>{query.genre}</option>}
          {genres.map((genre) => <option key={genre.idTheLoai} value={genre.idTheLoai}>{genre.tenTheLoai}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm"><span>Trạng thái</span>
        <select name="status" className={controlClass} value={query.status === "dang_ra" ? "dang_tien_hanh" : query.status} onChange={(event) => change({ status: event.target.value as AdminStoryQuery["status"] })}>
          <option value="all">Tất cả trạng thái</option><option value="dang_tien_hanh">Đang tiến hành</option><option value="hoan_thanh">Hoàn thành</option><option value="tam_dung">Tạm dừng</option><option value="sap_ra_mat">Sắp ra mắt</option>
        </select>
      </label>
      <label className="space-y-1 text-sm"><span>Sắp xếp theo</span>
        <select name="sortBy" className={controlClass} value={query.sortBy} onChange={(event) => change({ sortBy: event.target.value as AdminStoryQuery["sortBy"] })}>
          <option value="id">ID</option><option value="tenTruyen">Tên truyện</option><option value="soChuong">Số chương</option><option value="luotXem">Lượt xem</option><option value="ngayTao">Ngày tạo</option><option value="trang_thai">Trạng thái</option>
        </select>
      </label>
      <label className="space-y-1 text-sm"><span>Thứ tự</span>
        <select name="sortOrder" className={controlClass} value={query.sortOrder} onChange={(event) => change({ sortOrder: event.target.value as AdminStoryQuery["sortOrder"] })}><option value="asc">Tăng dần</option><option value="desc">Giảm dần</option></select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={query.vipOnly === "true" ? "default" : "outline"} aria-pressed={query.vipOnly === "true"} onClick={() => change({ vipOnly: query.vipOnly === "true" ? "false" : "true" })}>Chỉ truyện có VIP</Button>
        <Button type="button" variant="outline" onClick={() => { setSearch(""); setQuery({ ...defaultAdminStoryQuery, limit: query.limit }); }}>Đặt lại bộ lọc</Button>
      </div>
    </section>
  );
}
