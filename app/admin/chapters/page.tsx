"use client";

import { useRef, useState } from "react";
import ChapterFilter from "@/components/chapters/ChapterFilter";
import ChapterForm from "@/components/chapters/ChapterForm";
import ChapterTable, { Chapter } from "@/components/chapters/ChapterTable";
import { useChapters } from "@/hooks/useChapters";
import api from "@/lib/axios";
import ImportResultToast from "@/components/common/ImportResultToast";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus } from "lucide-react";

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

export default function ChaptersPage() {
  const {
    chapters,
    stories,
    query,
    setQuery,
    meta,
    loading,
    error,
    fetchChapters,
    setPage,
    limit,
    setLimit,
  } = useChapters();
  const [selected, setSelected] = useState<Chapter | null>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setImporting(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/admin/chapter/import", formData, {
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
              itemName="chương"
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
              itemName="chương"
            />
          ),
          {
            duration: 5000,
          },
        );
      }

      fetchChapters();
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
      const response = await api.get("/admin/chapter/export", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", "danh-sach-chuong.xlsx");

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen space-y-4 bg-white p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={handleImport}
      />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Quản lý chương truyện
          </h1>
          <p className="text-sm text-slate-500">
            Thêm, sửa, xóa chương và quản lý nội dung đọc.
          </p>
        </div>

        <Button
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
          disabled={stories.length === 0}
        >
          <Plus className="h-4 w-4" />
          Thêm chương
        </Button>
      </div>

      <ChapterFilter query={query} stories={stories} setQuery={setQuery} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          Tổng số:{" "}
          <b>
            {chapters.length}/{meta.total}
          </b>{" "}
          chương
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border bg-white py-10 text-center text-slate-500">
          Đang tải dữ liệu...
        </div>
      ) : (
        <ChapterTable
          data={chapters}
          onEdit={(item) => {
            setSelected(item);
            setOpen(true);
          }}
          refresh={fetchChapters}
        />
      )}

      <div className="flex items-center justify-center gap-4 py-4 text-slate-600">
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="!w-full !max-w-[720px]">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-semibold">
              {selected ? "Chỉnh sửa chương" : "Thêm chương mới"}
            </SheetTitle>
            <SheetDescription />
          </SheetHeader>

          {open && (
            <ChapterForm
              data={selected}
              stories={stories}
              onClose={() => setOpen(false)}
              onSuccess={fetchChapters}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
