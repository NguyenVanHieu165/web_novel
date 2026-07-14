"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/axios";
import type { Chapter } from "@/components/chapters/ChapterTable";

export type StoryOption = {
  idTruyen: number;
  tenTruyen: string;
};

type StoryApiItem = {
  idTruyen: number;
  tenTruyen: string;
};

export type ChapterQuery = {
  search: string;
  idTruyen: string;
  page: number;
  limit: number;
};

export type ChapterMeta = {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
};

const defaultQuery: ChapterQuery = {
  search: "",
  idTruyen: "all",
  page: 1,
  limit: 15,
};

const defaultMeta: ChapterMeta = {
  page: 1,
  limit: 15,
  total: 0,
  totalPage: 1,
};

type StoriesPayload = {
  data?: StoryApiItem[] | {
    data?: StoryApiItem[];
  };
};

type ChaptersPayload = {
  data?: {
    data?: Chapter[];
    meta?: Partial<ChapterMeta>;
  };
  success?: boolean;
  message?: string;
};

const normalizeStoryOptions = (payload: StoriesPayload) => {
  const data = Array.isArray(payload.data)
    ? payload.data
    : payload.data?.data || [];

  return data.map((story) => ({
    idTruyen: story.idTruyen,
    tenTruyen: story.tenTruyen,
  }));
};

export function useChapters(initialQuery: Partial<ChapterQuery> = {}) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [stories, setStories] = useState<StoryOption[]>([]);
  const [query, setQuery] = useState<ChapterQuery>({
    ...defaultQuery,
    ...initialQuery,
  });
  const [meta, setMeta] = useState<ChapterMeta>({
    ...defaultMeta,
    limit: initialQuery.limit ?? defaultMeta.limit,
  });
  const [loading, setLoading] = useState(false);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStoryOptions = useCallback(async () => {
    try {
      setStoriesLoading(true);

      const res = await api.get<StoriesPayload>("/admin/stories", {
        params: {
          page: 1,
          limit: 100,
        },
      });

      setStories(normalizeStoryOptions(res.data));
    } catch (err) {
      console.error("FETCH STORIES ERROR:", err);
      setStories([]);
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  const fetchChapters = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<ChaptersPayload>("/admin/chapter", {
        params: {
          page: query.page,
          limit: query.limit,
          search: query.search,
          ...(query.idTruyen !== "all" && {
            idTruyen: query.idTruyen,
          }),
        },
      });

      if (res.data?.success === false) {
        throw new Error(res.data.message || "Lấy danh sách chương thất bại");
      }

      const payload = res.data.data;

      setChapters(payload?.data || []);
      setMeta({
        ...defaultMeta,
        ...payload?.meta,
        page: payload?.meta?.page || defaultMeta.page,
        limit: payload?.meta?.limit || query.limit,
        total: payload?.meta?.total || 0,
        totalPage: payload?.meta?.totalPage || 1,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Có lỗi khi lấy danh sách chương";

      setError(message);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchStoryOptions, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchStoryOptions]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchChapters, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fetchChapters]);

  const setSearch = useCallback((search: string) => {
    setQuery((current) => ({
      ...current,
      search,
      page: 1,
    }));
  }, []);

  const setStory = useCallback((idTruyen: string) => {
    setQuery((current) => ({
      ...current,
      idTruyen,
      page: 1,
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setQuery((current) => ({
      ...current,
      page,
    }));
  }, []);

  const setLimit = useCallback((limit: number) => {
    setQuery((current) => ({
      ...current,
      limit,
      page: 1,
    }));
  }, []);

  return {
    chapters,
    stories,
    loading,
    storiesLoading,
    error,
    query,
    setQuery,
    meta,
    fetchChapters,
    fetchStoryOptions,
    refresh: fetchChapters,
    search: query.search,
    setSearch,
    idTruyen: query.idTruyen,
    setStory,
    page: query.page,
    setPage,
    limit: query.limit,
    setLimit,
  };
}
