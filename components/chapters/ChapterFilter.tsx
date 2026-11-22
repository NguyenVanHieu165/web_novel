"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { defaultChaptersQuery } from "@/schemas/admin-chapters.schema";
import type { ChapterQuery, StoryOption } from "@/hooks/useChapters";
import StoryCombobox from "./StoryCombobox";

export default function ChapterFilter({ query, stories, setQuery, onAutoVip }: { query: ChapterQuery; stories: StoryOption[]; setQuery: (query: ChapterQuery) => void; onAutoVip: () => void }) {
  const [search, setSearch] = useState(query.q);
  const [source, setSource] = useState(query.q);
  if (source !== query.q) { setSource(query.q); setSearch(query.q); }
  const apply = useEffectEvent((q: string) => setQuery({ ...query, q, page: 1 }));
  useEffect(() => { if (search === query.q) return; const timeout = setTimeout(() => apply(search.trim()), 300); return () => clearTimeout(timeout); }, [search, query.q]);
  return <section aria-label="Bộ lọc chương" className="grid items-end gap-3 rounded-lg border bg-card p-4 text-card-foreground sm:grid-cols-2 xl:grid-cols-3">
    <label className="space-y-1 text-sm font-medium"><span>Tìm chương</span><Input name="q" autoComplete="off" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tiêu đề, slug, tên truyện, 10 hoặc 10–20…" /></label>
    <StoryCombobox stories={stories} value={query.storyId} onChange={(storyId) => setQuery({ ...query, storyId, page: 1 })} />
    <label className="space-y-1 text-sm font-medium"><span>Loại chương</span><select className="h-9 w-full rounded-md border bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring" value={query.vipFilter} onChange={(event) => setQuery({ ...query, vipFilter: event.target.value as ChapterQuery["vipFilter"], page: 1 })}><option value="all">Tất cả</option><option value="free">Miễn phí</option><option value="vip">Chương VIP</option></select></label>
    <label className="space-y-1 text-sm font-medium"><span>Trạng thái xuất bản</span><select className="h-9 w-full rounded-md border bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring" value={query.publicationFilter} onChange={event => setQuery({ ...query, publicationFilter: event.target.value as ChapterQuery["publicationFilter"], page: 1 })}><option value="published">Đã xuất bản</option><option value="draft">Bản nháp (Ẩn)</option><option value="all">Công khai & bản nháp</option></select></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3">
      <Button type="button" variant={query.shortOnly === "true" ? "default" : "outline"} aria-pressed={query.shortOnly === "true"} onClick={() => setQuery({ ...query, shortOnly: query.shortOnly === "true" ? "false" : "true", page: 1 })}>Chương thiếu chữ (&lt; 100 chữ)</Button>
      <Button type="button" variant="outline" onClick={() => { setSearch(""); setQuery({ ...defaultChaptersQuery, limit: query.limit }); }}>Đặt lại bộ lọc</Button>
      {query.storyId && <Button type="button" variant="secondary" onClick={onAutoVip}>Cấu hình VIP nhanh</Button>}
    </div>
  </section>;
}
