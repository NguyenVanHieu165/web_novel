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
          <PageHeaderTitle>Quản lý thể loại</PageHeaderTitle>
          <PageHeaderDescription>Quản lý danh mục phân loại truyện trong hệ thống.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
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
        </PageHeaderActions>
      </PageHeader>

      <FilterBar>
        <FilterBarGroup>
          <div className="w-full max-w-sm">
            <label className="sr-only" htmlFor="genre-search">Tìm kiếm thể loại</label>
          <Input
            id="genre-search"
            placeholder="Tìm kiếm thể loại..."
            value={query.search}
            onChange={(e) => setSearch(e.target.value)}
          />
          </div>
        </FilterBarGroup>

        <FilterBarActions className="text-sm text-muted-foreground">
          <span>Hiển thị</span>
          <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
            <SelectTrigger aria-label="Số thể loại mỗi trang" size="sm" className="min-w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
            </SelectContent>
          </Select>
          <span>bản ghi / trang</span>
        </FilterBarActions>
      </FilterBar>

      <div className="text-sm text-muted-foreground">
        Tổng số:{" "}
        <b>
          {genres.length}/{meta?.total ?? 0}
        </b>{" "}
        thể loại
      </div>

      {error && <ErrorState><ErrorStateTitle>Không thể tải thể loại</ErrorStateTitle><ErrorStateDescription>{error}</ErrorStateDescription></ErrorState>}

      {loading ? (
        <div role="status" className="py-10 text-center text-muted-foreground">
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

      <Pagination>
        <PaginationContent>
          <PaginationItem><Button variant="outline" size="sm" disabled={query.page === 1} onClick={() => setPage(query.page - 1)}>Trước</Button></PaginationItem>
          <PaginationItem><span className="px-2 text-sm font-medium">Trang {query.page} / {meta?.totalPage ?? 1}</span></PaginationItem>
          <PaginationItem><Button variant="outline" size="sm" disabled={query.page >= (meta?.totalPage ?? 1)} onClick={() => setPage(query.page + 1)}>Sau</Button></PaginationItem>
        </PaginationContent>
      </Pagination>

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
