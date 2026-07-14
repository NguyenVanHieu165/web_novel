"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/axios";
import type { StoryFormValues } from "@/schemas/story-schema";

export type StoryGenreRelation = {
  idTheLoai?: number | string;
  tenTheLoai?: string;
  theLoai?: {
    idTheLoai?: number | string;
    tenTheLoai?: string;
  };
};
export type Story = {
  idTruyen: number;
  tenTruyen: string;
  slug?: string;
  anhBia?: string | null;
  anhThumbnail?: string | null;
  trang_thai: StoryFormValues["trang_thai"];
  createdAt: string;
  luotXem: number;
  theLoaiIds?: unknown[];
  soChuong?: number;
  truyenTheLoai?: StoryGenreRelation[];
};

export type StoryQuery = {
  search: string;
  page: number;
  limit: number;
};

export type StoryMeta = {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
};

const defaultQuery: StoryQuery = {
  search: "",
  page: 1,
  limit: 15,
};

const defaultMeta: StoryMeta = {
  page: 1,
  limit: 15,
  total: 0,
  totalPage: 1,
};

type StoriesPayload = {
  data?: Story[] | {
    data?: Story[];
    meta?: Partial<StoryMeta>;
  };
  meta?: Partial<StoryMeta>;
};

const normalizeStoriesResponse = (payload: StoriesPayload) => {
  const data = Array.isArray(payload.data)
    ? payload.data
    : payload.data?.data || [];

  const meta =
    payload.meta || (Array.isArray(payload.data) ? undefined : payload.data?.meta) || defaultMeta;

  return {
    stories: Array.isArray(data) ? data : [],
    meta: {
      ...defaultMeta,
      ...meta,
      page: meta.page || defaultMeta.page,
      limit: meta.limit || defaultMeta.limit,
      total: meta?.total || 0,
      totalPage: meta?.totalPage || 1,
    },
  };
};

export function useStories(initialQuery: Partial<StoryQuery> = {}) {
  const [stories, setStories] = useState<Story[]>([]);
  const [query, setQuery] = useState<StoryQuery>({
    ...defaultQuery,
    ...initialQuery,
  });
  const [meta, setMeta] = useState<StoryMeta>({
    ...defaultMeta,
    limit: initialQuery.limit ?? defaultMeta.limit,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/admin/stories", {
        params: query,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Lấy danh sách truyện thất bại");
      }

      const normalized = normalizeStoriesResponse(res.data);

      setStories(normalized.stories);
      setMeta(normalized.meta);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Có lỗi khi lấy danh sách truyện";

      setError(message);
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchStories, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fetchStories]);

  const setSearch = useCallback((search: string) => {
    setQuery((current) => ({
      ...current,
      search,
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
    stories,
    loading,
    error,
    query,
    setQuery,
    meta,
    fetchStories,
    refresh: fetchStories,
    search: query.search,
    setSearch,
    page: query.page,
    setPage,
    limit: query.limit,
    setLimit,
  };
}
