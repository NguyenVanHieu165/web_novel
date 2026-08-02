"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/axios";
import {
  chapterSchema,
  ChapterFormInput,
  ChapterFormValues,
} from "@/schemas/chapter-schema";
import { Button } from "@/components/ui/button";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import CollaborationSwitch from "@/components/editor/CollaborationSwitch";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, CheckCircle2, FileText, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";

type StoryOption = {
  idTruyen: number;
  tenTruyen: string;
};

type ChapterData = {
  idChuong: number;
  idTruyen?: number;
  chuongSo?: string | number;
  tieuDeChuong?: string;
  slug?: string;
  isFree?: boolean | null;
  giaXu?: number | null;
  truyen?: {
    idTruyen?: number;
    tenTruyen?: string;
  } | null;
  noiDungChuong?: {
    noiDung?: string | null;
  } | null;
};

type Props = {
  data?: ChapterData | null;
  stories: StoryOption[];
  onClose: () => void;
  onSuccess: () => void;
};

const createSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

export default function ChapterForm({
  data,
  stories,
  onClose,
  onSuccess,
}: Props) {
  const currentStoryId = data?.idTruyen ?? data?.truyen?.idTruyen;
  const currentStoryName = data?.truyen?.tenTruyen;

  const storyOptions = useMemo(() => {
    const merged = new Map<number, StoryOption>();

    stories.forEach((story) => {
      merged.set(story.idTruyen, story);
    });

    if (currentStoryId && currentStoryName) {
      merged.set(currentStoryId, {
        idTruyen: currentStoryId,
        tenTruyen: currentStoryName,
      });
    }

    return Array.from(merged.values());
  }, [currentStoryId, currentStoryName, stories]);

  const form = useForm<ChapterFormInput, unknown, ChapterFormValues>({
    resolver: zodResolver(chapterSchema),
    defaultValues: {
      idTruyen: currentStoryId ?? storyOptions[0]?.idTruyen ?? 0,
      chuongSo: 1,
      tieuDeChuong: "",
      slug: "",
      isFree: true,
      giaXu: 0,
      noiDung: "",
    },
  });

  const isFree =
    useWatch({
      control: form.control,
      name: "isFree",
    }) ?? true;

  const [collabEnabled, setCollabEnabled] = useState(false);

  // 1. THAY THẾ Ở ĐÂY: Đổi từ textareaRef sang editorContainerRef dành cho CodeMirror
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [authorName, setAuthorName] = useState("");

  useEffect(() => {
    let name = localStorage.getItem("collab_author_name");
    if (!name) {
      name = `Tác giả #${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("collab_author_name", name);
    }
    setAuthorName(name);
  }, []);

  // 2. THAY THẾ Ở ĐÂY: Cập nhật Hook để nhận containerRef và lấy hàm getContent thay thế
  const { onlineUsers, isConnected, getContent } = useCollaborativeEditor({
    chapterId: data?.idChuong ?? 0,
    initialContent: data?.noiDungChuong?.noiDung ?? "",
    enabled: collabEnabled,
    userName: authorName,
    editorContainerRef,
  });

  useEffect(() => {
    if (data) {
      form.reset({
        idTruyen: currentStoryId ?? storyOptions[0]?.idTruyen ?? 0,
        chuongSo: Number(data.chuongSo ?? 1),
        tieuDeChuong: data.tieuDeChuong ?? "",
        slug: data.slug ?? "",
        isFree: data.isFree ?? true,
        giaXu: data.giaXu ?? 0,
        noiDung: data.noiDungChuong?.noiDung ?? "",
      });
    } else {
      form.reset({
        idTruyen: storyOptions[0]?.idTruyen ?? 0,
        chuongSo: 1,
        tieuDeChuong: "",
        slug: "",
        isFree: true,
        giaXu: 0,
        noiDung: "",
      });
    }
  }, [currentStoryId, data, form, storyOptions]);

  const handleTitleChange = (
    value: string,
    onChange: (value: string) => void,
  ) => {
    onChange(value);

    if (!data) {
      form.setValue("slug", createSlug(value));
    }
  };

  const onSubmit = async (values: ChapterFormValues) => {
    try {
      // 3. THAY THẾ Ở ĐÂY: Nếu đang bật chế độ cộng tác, ta phải lấy dữ liệu mới nhất từ CodeMirror
      // trước khi gửi lên API, do react-hook-form không tự động bắt sự kiện gõ của CodeMirror nữa.
      let finalContent = values.noiDung;
      if (collabEnabled) {
        finalContent = getContent();
      }

      const payload = {
        ...values,
        noiDung: finalContent,
        giaXu: values.isFree ? 0 : values.giaXu,
      };

      if (data) {
        await api.put(`/admin/chapter/${data.idChuong}`, payload);
        toast.success("Cập nhật chương thành công");
      } else {
        await api.post("/admin/chapter", payload);
        toast.success("Thêm chương thành công");
      }

      form.reset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      toast.error(data ? "Cập nhật chương thất bại" : "Thêm chương thất bại", {
        description:
          apiError.response?.data?.message ||
          apiError.message ||
          "Có lỗi xảy ra",
      });
    }
  };

  return (
    <div className="overflow-y-auto px-4 pb-4">
      <div className="mb-3 rounded-lg border bg-gradient-to-r from-sky-50 to-white p-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-sky-100 p-2 text-sky-700">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {data ? "Chỉnh sửa chương" : "Thêm chương mới"}
            </h2>
            <p className="text-xs text-gray-500">
              Quản lý thông tin, giá xu và nội dung chương.
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {/* ... Phần thông tin chương giữ nguyên không đổi ... */}
          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase text-gray-500">
              Thông tin chương
            </h3>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField
                control={form.control}
                name="idTruyen"
                render={({ field }) => (
                  <FormItem className="space-y-1 md:col-span-2">
                    <FormLabel>Truyện</FormLabel>
                    <Select
                      value={String(field.value || "")}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Chọn truyện" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {storyOptions.map((story) => (
                          <SelectItem
                            key={story.idTruyen}
                            value={String(story.idTruyen)}
                          >
                            {story.tenTruyen}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chuongSo"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Số chương</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        className="h-9"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Hỗ trợ số lẻ như 10.5.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isFree"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Loại chương</FormLabel>
                    <Select
                      value={(field.value ?? true) ? "free" : "paid"}
                      onValueChange={(value) => {
                        const nextIsFree = value === "free";
                        field.onChange(nextIsFree);
                        if (nextIsFree) {
                          form.setValue("giaXu", 0);
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="free">Miễn phí</SelectItem>
                        <SelectItem value="paid">Trả phí</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tieuDeChuong"
                render={({ field }) => (
                  <FormItem className="space-y-1 md:col-span-2">
                    <FormLabel>Tiêu đề chương</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <BookOpen className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Ví dụ: Gặp lại cố nhân"
                          className="h-9 pl-10"
                          {...field}
                          onChange={(e) =>
                            handleTitleChange(e.target.value, field.onChange)
                          }
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="gap-lai-co-nhan"
                          className="h-9 pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="giaXu"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Giá xu</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Nhập giá xu"
                        disabled={isFree}
                        className="h-9"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value === 0 ? "" : (field.value ?? "")}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Chỉ áp dụng cho chương trả phí.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <CollaborationSwitch
              enabled={collabEnabled}
              onToggle={setCollabEnabled}
              isConnected={isConnected}
              onlineUsers={onlineUsers}
              disabled={!data}
            />

            <FormField
              control={form.control}
              name="noiDung"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Nội dung chương</FormLabel>
                  <FormControl>
                    {/* 4. THAY THẾ Ở ĐÂY: Rẽ nhánh giao diện tùy thuộc trạng thái nút switch */}
                    {collabEnabled ? (
                      /* Khi bật cộng tác: Hiện Div Container cho CodeMirror hiển thị */
                      <div
                        ref={editorContainerRef}
                        className="min-h-[260px] border rounded-md p-1 bg-gray-50/50 [&_.cm-editor]:outline-none [&_.cm-scroller]:font-sans [&_.cm-content]:leading-6"
                      />
                    ) : (
                      /* Khi tắt cộng tác: Quay lại ô Textarea truyền thống */
                      <Textarea
                        placeholder="Nhập nội dung chương..."
                        className="min-h-[260px] resize-y leading-6"
                        {...field}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              className="h-9 min-w-[90px]"
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={
                form.formState.isSubmitting || storyOptions.length === 0
              }
              className="h-9 min-w-[130px]"
            >
              {form.formState.isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang lưu...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {data ? "Cập nhật" : "Thêm chương"}
                </span>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
