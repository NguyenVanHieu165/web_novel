"use client";

import { useRef, useState } from "react";

import UserTable from "@/components/users/UseTable";
import UserForm from "@/components/users/UseForm";
import axios from "@/lib/axios";
import { useUsers, type User } from "@/hooks/useUsers";
import ImportResultToast from "@/components/common/ImportResultToast";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ImportResult = {
  insertedRows?: number;
  errorRows?: number;
  errors?: {
    row: number;
    message: string;
    field?: string;
  }[];
};

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

export default function UsersPage() {
  const {
    users,
    loading,
    error,
    query,
    meta,
    fetchUsers,
    setSearch,
    setPage,
    limit,
    setLimit,
  } = useUsers();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setImporting(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await axios.post("/admin/users/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      const result = (res.data.data ?? res.data) as ImportResult;

      if ((result.errorRows ?? 0) > 0) {
        toast.custom(
          () => (
            <ImportResultToast
              type="warning"
              title="Thông báo"
              insertedRows={result.insertedRows ?? 0}
              errorRows={result.errorRows ?? 0}
              itemName="người dùng"
              errors={result.errors ?? []}
            />
          ),
          {
            duration: 12000,
          },
        );
      } else {
        toast.custom(
          () => (
            <ImportResultToast
              type="success"
              title="Import thành công"
              insertedRows={result.insertedRows ?? 0}
              errorRows={0}
              itemName="người dùng"
            />
          ),
          {
            duration: 5000,
          },
        );
      }

      fetchUsers();
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;

      console.error(error);
      toast.custom(
        () => (
          <ImportResultToast
            type="error"
            title="Import thất bại"
            message={
              apiError.response?.data?.message ||
              "Có lỗi xảy ra khi import file"
            }
          />
        ),
        {
          duration: 7000,
        },
      );
    } finally {
      setImporting(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get("/admin/users/export", {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", "danh-sach-nguoi-dung.xlsx");

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = (item: User) => {
    setSelected(item);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={handleImport}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black">
          Danh sách người dùng
        </h1>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              setSelected(null);
              setOpen(true);
            }}
          >
            + Thêm người dùng mới
          </Button>
          <Button
            variant="outline"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Đang import..." : "Import Excel"}
          </Button>
          <Button onClick={handleExport}>Xuất Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm w-full">
          <Input
            placeholder="Tìm kiếm người dùng..."
            value={query.search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Hiển thị</span>
          <select
            className="h-9 rounded-md border px-3 text-sm outline-none"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span>bản ghi / trang</span>
        </div>
      </div>

      <div className="text-sm text-slate-500">
        Tổng số:{" "}
        <b>
          {users.length}/{meta.total}
        </b>{" "}
        người dùng
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <UserTable
          data={users}
          loading={loading}
          refresh={fetchUsers}
          onEdit={handleEdit}
        />
      </div>

      <div className="flex justify-center items-center gap-4 py-4 text-slate-600">
        <Button
          variant="outline"
          size="sm"
          disabled={query.page === 1}
          onClick={() => setPage(query.page - 1)}
        >
          Trước
        </Button>

        <span className="text-sm font-medium">
          Trang {query.page} / {meta.totalPage}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={query.page >= meta.totalPage}
          onClick={() => setPage(query.page + 1)}
        >
          Sau
        </Button>
      </div>

      {/* Drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="!w-full !max-w-[500px]">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-semibold">
              {selected ? "Chỉnh sửa người dùng" : "Thêm người dùng mới"}
            </SheetTitle>
            <SheetDescription>
              Tại đây bạn có thể chỉnh sửa thông tin người dùng.
            </SheetDescription>
          </SheetHeader>

          <div className="py-4">
            {open && (
              <UserForm
                data={selected}
                onClose={() => {
                  setOpen(false);
                }}
                onSuccess={() => {
                  fetchUsers();
                  setOpen(false);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
