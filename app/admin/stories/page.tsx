"use client";

import { useRef, useState } from "react";
import StoryTable from "@/components/stories/StoryTable";
import StoryFilter from "@/components/stories/StoryFilter";
import StoryForm from "@/components/stories/StoryForm";
import { toast } from "sonner";
import { LayoutGrid, TableProperties } from "lucide-react";
import ImportResultToast from "@/components/common/ImportResultToast";
import axios from "@/lib/axios";
import { useStories, type Story } from "@/hooks/useStories";
import StoryCardList from "@/components/stories/StoryCardList";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

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
type ViewMode = "table" | "card";

export default function StoriesPage() {
  const {
    stories,
    meta,
    query,
    setQuery,
    loading,
    error,
    fetchStories,
    setPage,
    limit,
    setLimit,
  } = useStories();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Story | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setImporting(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await axios.post("/admin/stories/import", formData, {
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
              itemName="truyện"
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
              itemName="truyện"
            />
          ),
          {
            duration: 5000,
          },
        );
      }

      fetchStories();
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
      const response = await axios.get("/admin/stories/export", {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", "danh-sach-truyen.xlsx");

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
        <h1 className="text-2xl font-bold text-slate-800">Quản lý truyện</h1>

        <div className="flex gap-3">
          <Button
            onClick={() => {
              setSelected(null);
              setOpen(true);
            }}
          >
            + Thêm truyện mới
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

      <StoryFilter query={query} setQuery={setQuery} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          Tổng số:{" "}
          <span className="font-semibold text-slate-800">
            {stories.length} / {meta.total}
          </span>{" "}
          truyện
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select
              className="h-9 rounded-md border bg-white px-3 text-sm outline-none"
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
            type="button"
            size="sm"
            variant={viewMode === "table" ? "default" : "outline"}
            className={viewMode === "table" ? "bg-fuchsia-600 text-white" : ""}
            onClick={() => setViewMode("table")}
          >
            <TableProperties className="h-4 w-4" />
            Bảng
          </Button>

          <Button
            type="button"
            size="sm"
            variant={viewMode === "card" ? "default" : "outline"}
            className={viewMode === "card" ? "bg-fuchsia-600 text-white" : ""}
            onClick={() => setViewMode("card")}
          >
            <LayoutGrid className="h-4 w-4" />
            Card
          </Button>
        </div>
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
      ) : viewMode === "table" ? (
        <StoryTable
          data={stories}
          onEdit={(item) => {
            setSelected(item);
            setOpen(true);
          }}
          refresh={fetchStories}
        />
      ) : (
        <StoryCardList
          data={stories}
          onEdit={(item) => {
            setSelected(item);
            setOpen(true);
          }}
          refetch={fetchStories}
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
        <SheetContent side="right" className="!w-full !max-w-[500px] p-0">
          <SheetHeader className="sticky top-0 z-10 border-b bg-white px-6 py-4">
            <SheetTitle>
              {selected ? "Chỉnh sửa truyện" : "Thêm truyện mới"}
            </SheetTitle>
          </SheetHeader>

          <div className="h-[calc(100vh-80px)] overflow-y-auto p-6">
            <StoryForm
              data={selected}
              onClose={() => setOpen(false)}
              onSuccess={fetchStories}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
