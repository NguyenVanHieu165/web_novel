"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import type { Story, StoryMeta } from "@/hooks/useStories";
import { adminStoryQuerySchema, adminStoryQueryParams, defaultAdminStoryQuery, type AdminStoryQuery } from "@/schemas/admin-story-query.schema";

export type AdminStory = Story & { soChuong: number; soChuongVip: number };
export type StoryGenre = { idTheLoai: number; tenTheLoai: string };
type Payload = { success: boolean; message?: string; data: { data: AdminStory[]; meta: StoryMeta; genres: StoryGenre[] } };

export function useAdminStories() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const queryString = searchParams.toString();
  const parsed = useMemo(() => adminStoryQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(queryString))), [queryString]);
  const query = parsed.success ? parsed.data : defaultAdminStoryQuery;
  const [result, setResult] = useState<Payload["data"]>({ data: [], genres: [], meta: { page: 1, limit: 15, total: 0, totalPage: 1 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const fetchStories = useCallback(() => setRevision((value) => value + 1), []);
  const setQuery = (next: AdminStoryQuery) => {
    const params = new URLSearchParams(queryString);
    for (const key of ["q", "search", "genreId", "genre", "status", "chapterRange", "vipOnly", "sortBy", "sortOrder", "page", "limit"]) params.delete(key);
    adminStoryQueryParams(next).forEach((value, key) => params.set(key, value));
    window.history.replaceState(null, "", `${pathname}${params.size ? `?${params}` : ""}`);
  };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<Payload>("/admin/stories", { params: new URLSearchParams(queryString), signal: controller.signal });
        if (!response.data.success) throw new Error(response.data.message || "Không thể tải danh sách truyện");
        if (!controller.signal.aborted) setResult(response.data.data);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Không thể tải danh sách truyện");
          setResult((current) => ({ ...current, data: [] }));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [queryString, revision]);
  return {
    stories: result.data, genres: result.genres, meta: result.meta, query, setQuery,
    loading, error: parsed.success ? error : "URL chứa bộ lọc không hợp lệ. Hãy đặt lại bộ lọc.", fetchStories,
    setPage: (page: number) => setQuery({ ...query, page }),
    limit: query.limit, setLimit: (limit: number) => setQuery({ ...query, limit, page: 1 }),
  };
}
