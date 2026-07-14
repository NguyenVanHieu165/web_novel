"use client";

import { Button } from "@/components/ui/button";
import axiosClient from "@/lib/axios";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { sort } from "fast-sort";

export type Genre = {
  idTheLoai: number;
  tenTheLoai: string;
  moTa: string | null;
  createdAt?: string | null;
};

type GenreTableProps = {
  data: Genre[];
  loading?: boolean;
  onEdit: (genre: Genre) => void;
  refresh: () => void;
};

type SortKey = "idTheLoai" | "tenTheLoai" | "moTa";
type SortOrder = "asc" | "desc";

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

export default function GenreTable({
  data,
  loading,
  onEdit,
  refresh,
}: GenreTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("idTheLoai");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  const sortedData = useMemo(() => {
    const getValue = (item: Genre) => {
      if (sortKey === "idTheLoai") return item.idTheLoai;
      if (sortKey === "tenTheLoai") return item.tenTheLoai || "";
      if (sortKey === "moTa") return item.moTa || "";

      return "";
    };

    return sortOrder === "asc"
      ? sort(data).asc(getValue)
      : sort(data).desc(getValue);
  }, [data, sortKey, sortOrder]);

  const renderSortHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className="inline-flex items-center gap-1 font-semibold hover:text-blue-600"
    >
      {label}
      <span className="text-xs normal-case">{getSortIcon(key)}</span>
    </button>
  );

  if (loading) {
    return <div className="p-4 text-sm text-gray-500">Đang tải dữ liệu...</div>;
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa thể loại này?")) return;

    const loadingToast = toast.loading("Đang xoá thể loại...");

    try {
      const res = await axiosClient.delete(`/admin/genres/${id}`);

      if (!res.data.success) {
        throw new Error(res.data.message || "Xóa thất bại");
      }

      toast.dismiss(loadingToast);

      toast.success("Xóa thành công", {
        description: "Thể loại đã được xoá khỏi hệ thống",
      });

      refresh();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      toast.dismiss(loadingToast);

      toast.error("Xóa thất bại", {
        description:
          apiError.response?.data?.message ||
          apiError.message ||
          "Có lỗi xảy ra",
      });
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-3 text-left">
              {renderSortHeader("ID", "idTheLoai")}
            </th>
            <th className="border p-3 text-left">
              {renderSortHeader("Tên thể loại", "tenTheLoai")}
            </th>
            <th className="border p-3 text-left">
              {renderSortHeader("Mô tả", "moTa")}
            </th>
            <th className="border p-3 text-center">Hành động</th>
          </tr>
        </thead>

        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={4} className="border p-4 text-center text-gray-500">
                Chưa có thể loại nào
              </td>
            </tr>
          ) : (
            sortedData.map((genre) => (
              <tr key={genre.idTheLoai} className="hover:bg-gray-50">
                <td className="border p-3">{genre.idTheLoai}</td>
                <td className="border p-3 font-medium">{genre.tenTheLoai}</td>
                <td className="border p-3">{genre.moTa || "Không có mô tả"}</td>

                <td className="border p-3">
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEdit(genre)}
                    >
                      Sửa
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(genre.idTheLoai)}
                    >
                      Xóa
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
