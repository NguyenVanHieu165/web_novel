// app/admin/genres/page.tsx
"use client";

import { useRef, useState } from "react";
import GenreTable, { type Genre } from "@/components/genres/GenreTable";
import GenreForm from "@/components/genres/GenreForm";
import { useGenres } from "@/hooks/useGenres";
import api from "@/lib/axios";
import ImportResultToast from "@/components/common/ImportResultToast";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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

export default function GenresPage() {
  const {
    genres,
    meta,
    query,
    loading,
    error,
    fetchGenres,
    setSearch,
    setPage,
    limit,
    setLimit,
  } = useGenres();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Genre | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setImporting(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/admin/genres/import", formData, {
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
              itemName="thể loại"
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
              itemName="thể loại"
            />
          ),
          {
            duration: 5000,
          },
        );
      }

      fetchGenres();
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
      const response = await api.get("/admin/genres/export", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", "danh-sach-the-loai.xlsx");

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="p-6 space-y-4 bg-white min-h-screen">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={handleImport}
      />

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Quản lý thể loại</h1>

        <div className="flex gap-3">
          <Button
            onClick={() => {
              setSelected(null);
              setOpen(true);
            }}
          >
            + Thêm thể loại mới
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
            placeholder="Tìm kiếm thể loại..."
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
          {genres.length}/{meta?.total ?? 0}
        </b>{" "}
        thể loại
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-slate-500">
          Đang tải dữ liệu...
        </div>
      ) : (
        <GenreTable
          data={genres}
          loading={loading}
          onEdit={(item) => {
            setSelected(item);
            setOpen(true);
          }}
          refresh={fetchGenres}
        />
      )}

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
          Trang {query.page} / {meta?.totalPage ?? 1}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={query.page >= (meta?.totalPage ?? 1)}
          onClick={() => setPage(query.page + 1)}
        >
          Sau
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>
              {selected ? "Cập nhật thể loại" : "Thêm thể loại mới"}
            </SheetTitle>

            <SheetDescription>
              {selected
                ? "Chỉnh sửa thông tin thể loại trong hệ thống."
                : "Thêm thể loại mới vào hệ thống."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            <GenreForm
              data={selected}
              onClose={() => {
                setOpen(false);
                setSelected(null);
              }}
              onSuccess={fetchGenres}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
