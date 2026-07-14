"use client";

import { useEffect } from "react";

import { useForm } from "react-hook-form";
import { userSchema, UserFormValues } from "@/schemas/user_schema";
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
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      tenTaikhoan: "",
      email: "",
      trangThai: "active",
    },
  });
  useEffect(() => {
    if (data) {
      form.reset({
        tenTaikhoan: data.tenTaiKhoan || "",
        email: data.email || "",
        trangThai: data.trangThai || "active",
      });
    }
  }, [data, form]);
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
                {data ? "Cập nhật" : "Thêm truyện"}
              </span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
