"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { genres_schema, GenresFormValues } from "@/schemas/genres_schema";
import api from "@/lib/axios";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Props = {
  data?: any;
  onClose: () => void;
  onSuccess: () => void;
};

export default function GenreForm({ data, onClose, onSuccess }: Props) {
  const form = useForm<GenresFormValues>({
    resolver: zodResolver(genres_schema),
    defaultValues: {
      tenTheLoai: "",
      moTa: "",
    },
  });

  useEffect(() => {
    if (data) {
      form.reset({
        tenTheLoai: data.tenTheLoai || "",
        moTa: data.moTa || "",
      });
    } else {
      form.reset({
        tenTheLoai: "",
        moTa: "",
      });
    }
  }, [data, form]);

  const onSubmit = async (values: GenresFormValues) => {
    try {
      if (data) {
        await api.put(`/admin/genres/${data.idTheLoai}`, values);
        alert("Cập nhật thể loại thành công");
      } else {
        await api.post("/admin/genres", values);
        alert("Thêm thể loại thành công");
      }

      form.reset();
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Lỗi khi lưu thể loại:", err);
      alert("Có lỗi xảy ra khi lưu thể loại");
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          {data ? "Cập nhật thể loại" : "Thêm thể loại mới"}
        </h2>

        <p className="text-sm text-gray-500 mt-1">
          Quản lý thông tin thể loại trong hệ thống
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="tenTheLoai"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tên thể loại</FormLabel>

                <FormControl>
                  <Input
                    placeholder="Ví dụ: Hành động, Tình cảm, Tu tiên..."
                    {...field}
                  />
                </FormControl>

                <FormDescription>
                  Tên thể loại phải có ít nhất 2 ký tự.
                </FormDescription>

                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="moTa"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mô tả</FormLabel>

                <FormControl>
                  <Textarea
                    placeholder="Nhập mô tả ngắn cho thể loại"
                    rows={4}
                    {...field}
                  />
                </FormControl>

                <FormDescription>Mô tả có thể để trống.</FormDescription>

                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Đang lưu..."
                : data
                  ? "Cập nhật"
                  : "Thêm mới"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
