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
import { Card, CardContent } from "@/components/ui/card";
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

      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Danh sách người dùng</PageHeaderTitle>
          <PageHeaderDescription>Quản lý tài khoản và thông tin người dùng trong hệ thống.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
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
        </PageHeaderActions>
      </PageHeader>

      <FilterBar>
        <FilterBarGroup>
          <div className="w-full max-w-sm">
            <label className="sr-only" htmlFor="user-search">Tìm kiếm người dùng</label>
          <Input
            id="user-search"
            placeholder="Tìm kiếm người dùng..."
            value={query.search}
            onChange={(e) => setSearch(e.target.value)}
          />
          </div>
        </FilterBarGroup>

        <FilterBarActions className="text-sm text-muted-foreground">
          <span>Hiển thị</span>
          <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
            <SelectTrigger aria-label="Số người dùng mỗi trang" size="sm" className="min-w-20"><SelectValue /></SelectTrigger>
            <SelectContent>{[5, 10, 15, 20, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
          </Select>
          <span>bản ghi / trang</span>
        </FilterBarActions>
      </FilterBar>

      <div className="text-sm text-muted-foreground">
        Tổng số:{" "}
        <b>
          {users.length}/{meta.total}
        </b>{" "}
        người dùng
      </div>

      {error && <ErrorState><ErrorStateTitle>Không thể tải người dùng</ErrorStateTitle><ErrorStateDescription>{error}</ErrorStateDescription></ErrorState>}
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
        <UserTable
          data={users}
          loading={loading}
          refresh={fetchUsers}
          onEdit={handleEdit}
        />
        </CardContent>
      </Card>

      <Pagination><PaginationContent>
        <PaginationItem><Button variant="outline" size="sm" disabled={query.page === 1} onClick={() => setPage(query.page - 1)}>Trước</Button></PaginationItem>
        <PaginationItem><span className="px-2 text-sm font-medium">Trang {query.page} / {meta.totalPage}</span></PaginationItem>
        <PaginationItem><Button variant="outline" size="sm" disabled={query.page >= meta.totalPage} onClick={() => setPage(query.page + 1)}>Sau</Button></PaginationItem>
      </PaginationContent></Pagination>

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
