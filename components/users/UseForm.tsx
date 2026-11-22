"use client";

import { useEffect, useState } from "react";

import { useForm, useWatch } from "react-hook-form";
import { createUserSchema, type UserFormValues } from "@/schemas/user_schema";
import { roleLabel, type RoleOption } from "@/schemas/admin-roles.schema";
import { zodResolver } from "@hookform/resolvers/zod";

import api from "@/lib/axios";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";

type Props = {
  data?: {
    idTaiKhoan: number;
    tenTaiKhoan?: string | null;
    email?: string | null;
    trangThai?: UserFormValues["trangThai"] | null;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
};

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

export default function UserForm({ data, onClose, onSuccess }: Props) {
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>();
  const form = useForm<UserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      tenTaikhoan: "",
      email: "",
      trangThai: "active",
    },
  });
  const roleId = useWatch({ control: form.control, name: "roleId" });
  const creatingAdmin = !data && roleOptions?.some((role) => role.idVaiTro === roleId && role.tenVaiTro === "admin");
  useEffect(() => {
    if (data) {
      form.reset({
        tenTaikhoan: data.tenTaiKhoan || "",
        email: data.email || "",
        trangThai: data.trangThai || "active",
      });
    }
  }, [data, form]);
  useEffect(() => {
    if (data) return;
    const controller = new AbortController();
    void fetch("/api/admin/roles", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Roles unavailable");
      const result: { roles: RoleOption[] } = await response.json();
      if (!controller.signal.aborted) setRoleOptions(result.roles);
    }).catch(() => {
      if (!controller.signal.aborted) setRoleOptions([]);
    });
    return () => controller.abort();
  }, [data]);
  const onSubmit = async (values: UserFormValues) => {
    try {
      if (data) {
        await api.put(`/admin/users/${data.idTaiKhoan}`, values);
        alert("Cập nhật người dùng thành công ✅");
      } else {
        await api.post("/admin/users", values);
        alert("Tạo người dùng thành công ✅");
      }
      onSuccess();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      alert(
        apiError.response?.data?.message ||
          apiError.message ||
          "Có lỗi xảy ra ❌",
      );
    }
  };
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="tenTaikhoan"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên tài khoản</FormLabel>
              <FormControl>
                <Input placeholder="Tên tài khoản" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="Email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trangThai"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trạng thái</FormLabel>

              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                </FormControl>

                <SelectContent>
                  <SelectItem value="active">Hoạt động</SelectItem>

                  <SelectItem value="locked">Khóa</SelectItem>

                  <SelectItem value="banned">Cấm</SelectItem>
                </SelectContent>
              </Select>

              <FormMessage />
            </FormItem>
          )}
        />

        {!data && (
          <FormField control={form.control} name="roleId" render={({ field }) => (
            <FormItem>
              <FormLabel>Vai trò ban đầu</FormLabel>
              <FormControl>
                <select name={field.name} ref={field.ref} onBlur={field.onBlur} value={field.value ?? ""}
                  onChange={(event) => {
                    form.unregister("initialPassword");
                    field.onChange(event.target.value ? Number(event.target.value) : undefined);
                  }}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-blue-600">
                  <option value="">Độc giả (mặc định)</option>
                  {roleOptions?.filter((role) => role.tenVaiTro !== "user").map((role) => (
                    <option key={role.idVaiTro} value={role.idVaiTro}>{roleLabel(role.tenVaiTro)}</option>
                  ))}
                </select>
              </FormControl>
              {!roleOptions?.length && (
                <p role="status" className="text-xs text-muted-foreground">
                  {roleOptions === undefined ? "Đang tải vai trò…" : "Độc giả được dùng mặc định khi danh sách vai trò không có sẵn."}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )} />
        )}
        {creatingAdmin && (
          <FormField control={form.control} name="initialPassword" render={({ field }) => (
            <FormItem>
              <FormLabel>Mật khẩu quản trị ban đầu</FormLabel>
              <FormControl>
                <Input type="password" minLength={12} maxLength={50} autoComplete="new-password"
                  required {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-w-[100px]"
          >
            Hủy
          </Button>

          <Button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="min-w-[140px]"
          >
            {form.formState.isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang lưu...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {data ? "Cập nhật" : "Thêm người dùng"}
              </span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
