"use client";

import { useMemo, useState } from "react";
import axiosClient from "@/lib/axios";
import { sort } from "fast-sort";
import type { User } from "@/hooks/useUsers";
import { roleLabel } from "@/schemas/admin-roles.schema";

type SortKey = "idTaiKhoan" | "tenTaiKhoan" | "email" | "vaiTro" | "trangThai";
type SortOrder = "asc" | "desc";

function userRoles(user: User) {
  return [...new Set(user.vaiTroNguoiDung?.flatMap(({ vaiTro }) =>
    vaiTro?.tenVaiTro ? [roleLabel(vaiTro.tenVaiTro)] : []) ?? [])].sort().join(", ");
}

type UserTableProps = {
  data?: User[];
  loading?: boolean;
  onEdit: (user: User) => void;
  refresh: () => void;
};

type ApiErrorResponse = {
  message?: string;
  response?: {
    data?: {
      message?: string;
    };
  };
};

export default function UserTable({
  data = [],
  onEdit,
  refresh,
}: UserTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("idTaiKhoan");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const sortedData = useMemo(() => {
    const getValue = (item: User) => {
      if (sortKey === "vaiTro") {
        return userRoles(item);
      }

      return item[sortKey] ?? "";
    };

    return sortOrder === "asc"
      ? sort(data).asc(getValue)
      : sort(data).desc(getValue);
  }, [data, sortKey, sortOrder]);

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  const renderSortHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="inline-flex items-center justify-center gap-1 font-semibold hover:text-blue-600"
    >
      {label}
      <span className="text-xs normal-case">{sortIcon(key)}</span>
    </button>
  );

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa?")) return;

    try {
      const res = await axiosClient.delete(`/admin/users/${id}`);

      if (!res.data.success) {
        throw new Error(res.data.message || "Xóa thất bại");
      }

      alert("Xóa thành công ✅");
      refresh();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      alert(
        apiError.response?.data?.message ||
          apiError.message ||
          "Có lỗi khi xóa ❌",
      );
    }
  };

  return (
    <table className="w-full border border-gray-300 text-center text-black border-collapse">
      <thead className="bg-gray-100">
        <tr>
          <th className="border p-2">
            {renderSortHeader("ID", "idTaiKhoan")}
          </th>
          <th className="border p-2">
            {renderSortHeader("Tên tài khoản", "tenTaiKhoan")}
          </th>
          <th className="border p-2">
            {renderSortHeader("Email", "email")}
          </th>
          <th className="border p-2">
            {renderSortHeader("Vai trò", "vaiTro")}
          </th>

          <th className="border p-2">
            {renderSortHeader("Trạng thái", "trangThai")}
          </th>

          <th className="border p-2">Hành động</th>
        </tr>
      </thead>

      <tbody>
        {sortedData.length === 0 ? (
          <tr>
            <td colSpan={6} className="border p-4">
              Không có dữ liệu
            </td>
          </tr>
        ) : (
          sortedData.map((item) => (
            <tr key={item.idTaiKhoan} className="hover:bg-gray-50 transition">
              <td className="border p-2">{item.idTaiKhoan}</td>
              <td className="border p-2">{item.tenTaiKhoan}</td>
              <td className="border p-2">{item.email}</td>
              <td className="border p-2">
                {userRoles(item) || "Chưa có vai trò"}
              </td>
              <td className="border p-2">{item.trangThai}</td>

              <td className="border p-2 space-x-2">
                <button
                  onClick={() => onEdit(item)}
                  className="bg-yellow-400 px-2 py-1 rounded"
                >
                  Sửa
                </button>

                <button
                  onClick={() => handleDelete(item.idTaiKhoan)}
                  className="bg-red-500 text-white px-2 py-1 rounded"
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
