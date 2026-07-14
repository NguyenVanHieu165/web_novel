"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [query, setQuery] = useState<UserQuery>({
    ...defaultQuery,
    ...initialQuery,
  });
  const [meta, setMeta] = useState<UserMeta>({
    ...defaultMeta,
    limit: initialQuery.limit ?? defaultMeta.limit,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<UsersPayload>("/admin/users", {
        params: query,
      });

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
      const message =
        err instanceof Error ? err.message : "Có lỗi khi lấy danh sách người dùng";

      setError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchUsers, 300);

    return () => window.clearTimeout(timeoutId);
  }, [fetchUsers]);

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
