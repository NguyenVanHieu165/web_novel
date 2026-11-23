"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import StoryTable from "@/components/stories/StoryTable";
import StoryFilter from "@/components/stories/StoryFilter";
import StoryForm from "@/components/stories/StoryForm";
import { toast } from "sonner";
import ImportResultToast from "@/components/common/ImportResultToast";
import axios from "@/lib/axios";
import { isAxiosError } from "axios";
import type { Story } from "@/hooks/useStories";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";

type StoryListMeta = { totalPage: number; total: number; page: number };
type StoryListResponse = {
  data?: Story[] | { data?: Story[]; meta?: StoryListMeta };
  meta?: StoryListMeta;
};
type ImportResult = {
  insertedRows?: number;
  errorRows?: number;
  errors?: { row: number; message: string; field?: string }[];
};

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [meta, setMeta] = useState({ totalPage: 1, total: 0, page: 1 });
  const [query, setQuery] = useState({ search: "", page: 1, limit: 15 });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Story | null>(null);
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setImporting(true);

      const formData = new FormData();
      formData.append("file", file);

      const res = await axios.post<ImportResult & { data?: ImportResult }>("/admin/stories/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const result = res.data.data ?? res.data;

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
    } catch (error) {
      console.error(error);
      const message = isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;

      toast.custom(
        () => (
          <ImportResultToast
            type="error"
            title="Import thất bại"
            message={
              message || "Có lỗi xảy ra khi import file"
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

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);

      const res = await api.get<StoryListResponse>("/admin/stories", {
        params: {
          page: query.page,
          limit: query.limit,
          search: query.search,
        },
      });

      const storiesData = Array.isArray(res.data.data)
        ? res.data.data
        : res.data.data?.data || [];

      const metaData = res.data.meta ||
        (Array.isArray(res.data.data) ? undefined : res.data.data?.meta) || {
          totalPage: 1,
          total: 0,
          page: 1,
        };

      setStories(storiesData);
      setMeta(metaData);
    } catch (err) {
      console.error("Fetch error:", err);
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(fetchStories, 300);
    return () => clearTimeout(t);
  }, [fetchStories]);

  return (
    <div className="min-h-screen space-y-6 bg-background p-3 text-foreground sm:p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={handleImport}
      />

      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Cài đặt nội dung truyện</PageHeaderTitle>
          <PageHeaderDescription>Quản lý danh sách truyện từ khu vực cấu hình quản trị.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
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
        </PageHeaderActions>
      </PageHeader>

      <StoryFilter query={query} setQuery={setQuery} />

      {loading ? (
        <div role="status" className="py-10 text-center text-muted-foreground">
          Đang tải dữ liệu…
        </div>
      ) : (
        <StoryTable
          data={stories}
          onEdit={(item) => {
            setSelected(item);
            setOpen(true);
          }}
          refresh={fetchStories}
        />
      )}
      <Pagination><PaginationContent>
        <PaginationItem><Button variant="outline" size="sm" disabled={query.page === 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Trước</Button></PaginationItem>
        <PaginationItem><span className="px-2 text-sm font-medium">Trang {query.page} / {meta?.totalPage ?? 1}</span></PaginationItem>
        <PaginationItem><Button variant="outline" size="sm" disabled={query.page >= (meta?.totalPage ?? 1)} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Sau</Button></PaginationItem>
      </PaginationContent></Pagination>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="!w-full !max-w-[500px]">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-xl font-semibold">
              {selected ? "Chỉnh sửa truyện" : "Thêm truyện mới"}
            </SheetTitle>
            <SheetDescription />
          </SheetHeader>
          {open && (
            <StoryForm
              data={selected}
              onClose={() => setOpen(false)}
              onSuccess={fetchStories}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
