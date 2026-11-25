"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import api from "@/lib/axios";
import type { Genre } from "@/components/genres/GenreTable";

export type GenreQuery = {
  search: string;
  page: number;
  limit: number;
};

export type GenreMeta = {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
};

const defaultQuery: GenreQuery = {
  search: "",
  page: 1,
  limit: 15,
};

const defaultMeta: GenreMeta = {
  page: 1,
  limit: 15,
  total: 0,
  totalPage: 1,
};

type GenresPayload = {
  data?: Genre[] | {
    data?: Genre[];
    meta?: Partial<GenreMeta>;
  };
  meta?: Partial<GenreMeta>;
  success?: boolean;
  message?: string;
};

const normalizeGenresResponse = (payload: GenresPayload) => {
  const data = Array.isArray(payload.data)
    ? payload.data
    : payload.data?.data || [];

  const meta =
    payload.meta || (Array.isArray(payload.data) ? undefined : payload.data?.meta) || defaultMeta;

  return {
    genres: Array.isArray(data) ? data : [],
    meta: {
      ...defaultMeta,
      ...meta,
      page: meta.page || defaultMeta.page,
      limit: meta.limit || defaultMeta.limit,
      total: meta.total || 0,
      totalPage: meta.totalPage || 1,
    },
  };
};

export function useGenres(initialQuery: Partial<GenreQuery> = {}) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [query, setQueryState] = useState<GenreQuery>({
    ...defaultQuery,
    ...initialQuery,
  });
  const [meta, setMeta] = useState<GenreMeta>({
    ...defaultMeta,
    limit: initialQuery.limit ?? defaultMeta.limit,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const currentQuery = useRef(query);
  const invalidateRequest = useCallback(() => {
    requestVersion.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);
  const setQuery = useCallback((next: SetStateAction<GenreQuery>) => {
    const resolved = typeof next === "function" ? next(currentQuery.current) : next;
    if (resolved === currentQuery.current) return;
    currentQuery.current = resolved;
    // Invalidate immediately, including the gap before the next debounced request.
    invalidateRequest();
    setLoading(true);
    setQueryState(resolved);
  }, [invalidateRequest]);

  const fetchGenres = useCallback(async () => {
    invalidateRequest();
    const version = requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<GenresPayload>("/admin/genres", {
        params: query,
        signal: controller.signal,
      });
      if (controller.signal.aborted || version !== requestVersion.current) return;

      if (res.data?.success === false) {
        throw new Error(res.data.message || "Lấy danh sách thể loại thất bại");
      }

      const normalized = normalizeGenresResponse(res.data);

      setGenres(normalized.genres);
      setMeta(normalized.meta);
    } catch (err: unknown) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      const message =
        err instanceof Error ? err.message : "Có lỗi khi lấy danh sách thể loại";

      setError(message);
      setGenres([]);
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [query, invalidateRequest]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchGenres, 300);

    return () => {
      window.clearTimeout(timeoutId);
      invalidateRequest();
    };
  }, [fetchGenres, invalidateRequest]);

  const setSearch = useCallback((search: string) => {
    setQuery((current) => ({
      ...current,
      search,
      page: 1,
    }));
  }, [setQuery]);

  const setPage = useCallback((page: number) => {
    setQuery((current) => ({
      ...current,
      page,
    }));
  }, [setQuery]);

  const setLimit = useCallback((limit: number) => {
    setQuery((current) => ({
      ...current,
      limit,
      page: 1,
    }));
  }, [setQuery]);

  return {
    genres,
    loading,
    error,
    query,
    setQuery,
    meta,
    fetchGenres,
    refresh: fetchGenres,
    search: query.search,
    setSearch,
    page: query.page,
    setPage,
    limit: query.limit,
    setLimit,
  };
}
