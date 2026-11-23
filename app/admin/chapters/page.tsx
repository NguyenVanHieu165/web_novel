"use client";

import { Suspense, useRef, useState } from "react";
import ChapterPreview from "@/components/chapters/ChapterPreview";
import ChapterPriceSheet from "@/components/chapters/ChapterPriceSheet";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { FilterBar, FilterBarActions, FilterBarGroup } from "@/components/shared/filter-bar";
import { ErrorState, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";

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
  return <Suspense fallback={<p className="p-6" role="status">Đang tải quản lý chương…</p>}><ChaptersContent /></Suspense>;
}

function ChaptersContent() {
  const {
    chapters,
    listKey,
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
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [autoVip, setAutoVip] = useState(false);
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
    <div className="min-h-screen space-y-4 bg-background text-foreground p-3 sm:p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={handleImport}
      />

      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Quản lý chương truyện</PageHeaderTitle>
          <PageHeaderDescription>Thêm, sửa, xóa chương và quản lý nội dung đọc.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions><Button
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
          disabled={stories.length === 0}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Thêm chương
        </Button></PageHeaderActions>
      </PageHeader>

      <ChapterFilter query={query} stories={stories} setQuery={setQuery} onAutoVip={() => setAutoVip(true)} />

      <FilterBar aria-label="Thiết lập danh sách chương">
        <FilterBarGroup>
        <div className="text-sm text-muted-foreground">
          Tổng số:{" "}
          <b>
            {chapters.length}/{meta.total}
          </b>{" "}
          chương
        </div>
        </FilterBarGroup>

        <FilterBarActions>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
              <SelectTrigger aria-label="Số chương mỗi trang" size="sm" className="min-w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{[5, 10, 15, 20, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
            </Select>
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
        </FilterBarActions>
      </FilterBar>

      {error && <ErrorState><ErrorStateTitle>Không thể tải danh sách chương</ErrorStateTitle><ErrorStateDescription>{error}</ErrorStateDescription></ErrorState>}

      {loading ? (
        <div role="status" className="rounded-lg border bg-card py-10 text-center text-muted-foreground">
          Đang tải dữ liệu…
        </div>
      ) : (
        <ChapterTable
          key={listKey}
          query={query}
          onSort={(sortBy) => setQuery({ ...query, sortBy, sortOrder: query.sortBy === sortBy && query.sortOrder === "asc" ? "desc" : "asc", page: 1 })}
          onPreview={setPreviewId}
          data={chapters}
          onEdit={async (item) => {
            try {
              const response = await api.get<{ data: Chapter }>(`/admin/chapter/${item.idChuong}`);
              setSelected(response.data.data);
              setOpen(true);
            } catch {
              setSelected(null);
              toast.error("Không thể tải nội dung chương");
            }
          }}
          refresh={fetchChapters}
        />
      )}

      <Pagination><PaginationContent>
        <PaginationItem><Button variant="outline" size="sm" disabled={loading || query.page === 1} onClick={() => setPage(query.page - 1)}>Trước</Button></PaginationItem>
        <PaginationItem><span className="px-2 text-sm font-medium">Trang {query.page} / {meta.totalPage}</span></PaginationItem>
        <PaginationItem><Button variant="outline" size="sm" disabled={loading || query.page >= meta.totalPage} onClick={() => setPage(query.page + 1)}>Sau</Button></PaginationItem>
      </PaginationContent></Pagination>

      <ChapterPriceSheet target={autoVip && query.storyId ? { kind: "story", storyId: query.storyId } : null} onClose={() => setAutoVip(false)} onSuccess={fetchChapters} />
      <ChapterPreview id={previewId} onClose={() => setPreviewId(null)} onEdit={(chapter) => { setSelected(chapter); setOpen(true); }} onSuccess={fetchChapters} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="!w-full !max-w-[720px]">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-semibold">
              {selected ? "Chỉnh sửa chương" : "Thêm chương mới"}
            </SheetTitle>
            <SheetDescription>Chỉnh sửa thông tin và toàn bộ nội dung chương.</SheetDescription>
          </SheetHeader>

          {open && (
            <ChapterForm
              data={selected}
              storyId={query.storyId}
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
