"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import type { Chapter } from "@/components/chapters/ChapterTable";
import { adminChaptersQuerySchema, defaultChaptersQuery, type AdminChaptersQuery } from "@/schemas/admin-chapters.schema";

export type StoryOption = { idTruyen: number; tenTruyen: string };
export type ChapterQuery = AdminChaptersQuery;
export type ChapterMeta = { page: number; limit: number; total: number; totalPage: number };
type Payload = { success: boolean; message?: string; data: { data: Chapter[]; meta: ChapterMeta } };

export function useChapters() {
  const params = useSearchParams();
  const pathname = usePathname();
  const queryString = params.toString();
  const parsed = useMemo(() => adminChaptersQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(queryString))), [queryString]);
  const query = parsed.success ? parsed.data : defaultChaptersQuery;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [stories, setStories] = useState<StoryOption[]>([]);
  const [meta, setMeta] = useState<ChapterMeta>({ page: 1, limit: 20, total: 0, totalPage: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storiesError, setStoriesError] = useState(false);
  const [revision, setRevision] = useState(0);
  const fetchChapters = useCallback(() => setRevision((value) => value + 1), []);
  const setQuery = (next: ChapterQuery) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value !== undefined && value !== defaultChaptersQuery[key as keyof ChapterQuery]) search.set(key, String(value));
    window.history.replaceState(null, "", `${pathname}${search.size ? `?${search}` : ""}`);
  };
  useEffect(() => {
    const controller = new AbortController();
    api.get<{ success: boolean; data: StoryOption[] }>("/admin/chapters/stories", { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) { if (!response.data.success) throw new Error("Truyện"); setStories(response.data.data); setStoriesError(false); } })
      .catch(() => { if (!controller.signal.aborted) setStoriesError(true); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const response = await api.get<Payload>("/admin/chapters", { params: new URLSearchParams(queryString), signal: controller.signal });
        if (!response.data.success) throw new Error(response.data.message || "Không thể tải chương");
        if (!controller.signal.aborted) { setChapters(response.data.data.data); setMeta(response.data.data.meta); }
      } catch (err) { if (!controller.signal.aborted) { setChapters([]); setError(isAxiosError<{ message?: string }>(err) ? err.response?.data?.message || (err.code === "ECONNABORTED" ? "Tải chương quá lâu. Vui lòng thử lại." : err.message) : err instanceof Error ? err.message : "Không thể tải chương"); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [queryString, revision]);
  return { chapters, stories, query, setQuery, meta, loading, error: !parsed.success ? "URL bộ lọc không hợp lệ. Hãy đặt lại bộ lọc." : error || (storiesError ? "Không thể tải danh sách truyện. Hãy thử tải lại." : null), fetchChapters,
    setPage: (page: number) => setQuery({ ...query, page }), limit: query.limit, setLimit: (limit: number) => setQuery({ ...query, limit, page: 1 }), listKey: `${queryString}:${revision}` };
}
