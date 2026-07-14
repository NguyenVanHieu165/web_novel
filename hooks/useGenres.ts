"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [query, setQuery] = useState<GenreQuery>({
    ...defaultQuery,
    ...initialQuery,
  });
  const [meta, setMeta] = useState<GenreMeta>({
    ...defaultMeta,
    limit: initialQuery.limit ?? defaultMeta.limit,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGenres = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<GenresPayload>("/admin/genres", {
        params: query,
      });

      if (res.data?.success === false) {
        throw new Error(res.data.message || "Lấy danh sách thể loại thất bại");
      }

      const normalized = normalizeGenresResponse(res.data);

      setGenres(normalized.genres);
      setMeta(normalized.meta);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Có lỗi khi lấy danh sách thể loại";

      setError(message);
      setGenres([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchGenres, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fetchGenres]);

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
