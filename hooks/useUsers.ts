"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import api from "@/lib/axios";
import type { UserFormValues } from "@/schemas/user_schema";

export type User = {
  idTaiKhoan: number;
  tenTaiKhoan: string;
  email: string;
  trangThai: UserFormValues["trangThai"];
  vaiTroNguoiDung?: {
    vaiTro?: {
      tenVaiTro?: string;
    };
  }[];
};

export type UserQuery = {
  search: string;
  page: number;
  limit: number;
};

export type UserMeta = {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
};

const defaultQuery: UserQuery = {
  search: "",
  page: 1,
  limit: 15,
};

const defaultMeta: UserMeta = {
  page: 1,
  limit: 15,
  total: 0,
  totalPage: 1,
};

type UsersPayload = {
  data?: {
    users?: User[];
    meta?: Partial<UserMeta>;
  };
  meta?: Partial<UserMeta>;
  success?: boolean;
  message?: string;
};

export function useUsers(initialQuery: Partial<UserQuery> = {}) {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQueryState] = useState<UserQuery>({
    ...defaultQuery,
    ...initialQuery,
  });
  const [meta, setMeta] = useState<UserMeta>({
    ...defaultMeta,
    limit: initialQuery.limit ?? defaultMeta.limit,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const currentQuery = useRef(query);
  const invalidateRequest = useCallback(() => {
    requestVersion.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);
  const setQuery = useCallback((next: SetStateAction<UserQuery>) => {
    const resolved = typeof next === "function" ? next(currentQuery.current) : next;
    if (resolved === currentQuery.current) return;
    currentQuery.current = resolved;
    // Invalidate immediately, including the gap before the next debounced request.
    invalidateRequest();
    setLoading(true);
    setQueryState(resolved);
  }, [invalidateRequest]);

  const fetchUsers = useCallback(async () => {
    invalidateRequest();
    const version = requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<UsersPayload>("/admin/users", {
        params: query,
        signal: controller.signal,
      });
      if (controller.signal.aborted || version !== requestVersion.current) return;

      if (res.data?.success === false) {
        throw new Error(res.data.message || "Lấy danh sách người dùng thất bại");
      }

      const responseMeta = res.data.data?.meta || res.data.meta || defaultMeta;

      setUsers(res.data.data?.users ?? []);
      setMeta({
        ...defaultMeta,
        ...responseMeta,
        page: responseMeta.page || defaultMeta.page,
        limit: responseMeta.limit || defaultMeta.limit,
        total: responseMeta.total || 0,
        totalPage: responseMeta.totalPage || 1,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      const message =
        err instanceof Error ? err.message : "Có lỗi khi lấy danh sách người dùng";

      setError(message);
      setUsers([]);
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [query, invalidateRequest]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchUsers, 300);

    return () => {
      window.clearTimeout(timeoutId);
      invalidateRequest();
    };
  }, [fetchUsers, invalidateRequest]);

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
    users,
    loading,
    error,
    query,
    setQuery,
    meta,
    fetchUsers,
    refresh: fetchUsers,
    search: query.search,
    setSearch,
    page: query.page,
    setPage,
    limit: query.limit,
    setLimit,
  };
}
