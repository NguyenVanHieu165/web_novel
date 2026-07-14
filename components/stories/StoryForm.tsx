"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  storySchema,
  StoryFormInput,
  StoryFormValues,
} from "@/schemas/story-schema";
import api from "@/lib/axios";
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

import { Button } from "@/components/ui/button";

import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ImageIcon,
  Link2,
  Loader2,
  Search,
  X,
} from "lucide-react";

type Genre = {
  idTheLoai: number;
  tenTheLoai: string;
};

type StoryGenreRelation = {
  idTheLoai?: number | string;
  tenTheLoai?: string;
  theLoai?: {
    idTheLoai?: number | string;
    tenTheLoai?: string;
  };
};

type StoryData = {
  idTruyen: number | string;
  tenTruyen?: string;
  slug?: string;
  anhBia?: string | null;
  anhThumbnail?: string | null;
  trang_thai?: StoryFormValues["trang_thai"];
  theLoaiIds?: unknown[];
  truyenTheLoai?: StoryGenreRelation[];
};

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

type Props = {
  data?: StoryData | null;
  onClose: () => void;
  onSuccess: () => void;
};

const getSelectedGenresFromStory = (story?: StoryData | null): Genre[] => {
  const storyGenres = Array.isArray(story?.truyenTheLoai)
    ? story.truyenTheLoai
    : [];

  return storyGenres
    .map((item) => {
      const idTheLoai = Number(item?.idTheLoai ?? item?.theLoai?.idTheLoai);
      const tenTheLoai = item?.theLoai?.tenTheLoai ?? item?.tenTheLoai;

      if (!Number.isFinite(idTheLoai) || !tenTheLoai) {
        return null;
      }

      return {
        idTheLoai,
        tenTheLoai,
      };
    })
    .filter((genre: Genre | null): genre is Genre => genre !== null);
};
const uniqueIds = (ids: unknown[]) =>
  Array.from(
    new Set(
      ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
export default function StoryForm({ data, onClose, onSuccess }: Props) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genreSearch, setGenreSearch] = useState("");
  const [openGenreBox, setOpenGenreBox] = useState(false);
  const [pickedGenreOptions, setPickedGenreOptions] = useState<Genre[]>([]);

  const genreBoxRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<StoryFormInput, unknown, StoryFormValues>({
    resolver: zodResolver(storySchema),
    defaultValues: {
      tenTruyen: "",
      slug: "",
      anhBia: "",
      anhThumbnail: "",
      trang_thai: "dang_tien_hanh",
      theLoaiIds: [],
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        genreBoxRef.current &&
        !genreBoxRef.current.contains(event.target as Node)
      ) {
        setOpenGenreBox(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const res = await api.get("/admin/genres", {
          params: {
            search: genreSearch,
            limit: 20,
          },
        });

        const genreList = res.data?.data?.data || [];

        setGenres(Array.isArray(genreList) ? genreList : []);
      } catch (error) {
        console.error("GET GENRES ERROR:", error);
        setGenres([]);
      }
    };
    fetchGenres();
  }, [genreSearch]);

  useEffect(() => {
    if (data) {
      const selectedGenres = getSelectedGenresFromStory(data);

      const selectedIds = uniqueIds(
        selectedGenres.length > 0
          ? selectedGenres.map((genre) => genre.idTheLoai)
          : data.theLoaiIds || [],
      );

      form.reset({
        tenTruyen: data.tenTruyen || "",
        slug: data.slug || "",
        anhBia: data.anhBia || "",
        anhThumbnail: data.anhThumbnail || "",
        trang_thai: data.trang_thai || "dang_tien_hanh",
        theLoaiIds: selectedIds,
      });
    } else {
      form.reset({
        tenTruyen: "",
        slug: "",
        anhBia: "",
        anhThumbnail: "",
        trang_thai: "dang_tien_hanh",
        theLoaiIds: [],
      });
    }
  }, [data, form]);

  const handleGenerateSlug = (value: string) => {
    const slug = value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    form.setValue("slug", slug);
  };

  const onSubmit = async (values: StoryFormValues) => {
    try {
      const payload = {
        ...values,
        anhBia: values.anhBia || "",
        anhThumbnail: values.anhThumbnail || null,
        theLoaiIds: uniqueIds(values.theLoaiIds || []),
      };

      if (data) {
        await api.put(`/admin/stories/${data.idTruyen}`, payload);
        alert("Cập nhật truyện thành công");
      } else {
        await api.post(`/admin/stories`, payload);
        alert("Thêm truyện mới thành công");
      }

      form.reset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      console.error(err);
      alert(apiError.response?.data?.message || "Có lỗi xảy ra");
    }
  };

  const previewImage = form.watch("anhThumbnail") || form.watch("anhBia") || "";

  return (
    <div className="rounded-lg bg-white">
      <div className="mb-3 rounded-lg border bg-gradient-to-r from-indigo-50 to-white p-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-indigo-100 p-2 text-indigo-700">
            <BookOpen className="h-4 w-4" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {data ? "Chỉnh sửa truyện" : "Thêm truyện mới"}
            </h2>

            <p className="text-xs text-gray-500">
              Cập nhật thông tin, trạng thái, ảnh và thể loại truyện.
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Thông tin truyện
            </h3>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField
                control={form.control}
                name="tenTruyen"
                render={({ field }) => (
                  <FormItem className="space-y-1 md:col-span-2">
                    <FormLabel>Tên truyện</FormLabel>

                    <FormControl>
                      <Input
                        placeholder="Ví dụ: Đấu La Đại Lục"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          handleGenerateSlug(e.target.value);
                        }}
                        className="h-9"
                      />
                    </FormControl>

                    <FormDescription className="text-xs">
                      Tên hiển thị chính thức của truyện.
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Slug URL</FormLabel>

                    <FormControl>
                      <div className="relative">
                        <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />

                        <Input
                          placeholder="dau-la-dai-luc"
                          {...field}
                          className="h-9 pl-10"
                        />
                      </div>
                    </FormControl>

                    <FormDescription className="text-xs">
                      Đường dẫn URL.
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trang_thai"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Trạng thái</FormLabel>

                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Chọn trạng thái" />
                        </SelectTrigger>
                      </FormControl>

                      <SelectContent>
                        <SelectItem value="dang_tien_hanh">
                          Đang tiến hành
                        </SelectItem>

                        <SelectItem value="hoan_thanh">Hoàn thành</SelectItem>

                        <SelectItem value="tam_dung">Tạm dừng</SelectItem>

                        <SelectItem value="sap_ra_mat">Sắp ra mắt</SelectItem>
                      </SelectContent>
                    </Select>

                    <FormDescription className="text-xs">
                      Trạng thái hiện tại.
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="anhBia"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Link ảnh bìa</FormLabel>

                    <FormControl>
                      <div className="relative">
                        <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />

                        <Input
                          placeholder="https://example.com/cover.jpg"
                          {...field}
                          value={field.value || ""}
                          className="h-9 pl-10"
                        />
                      </div>
                    </FormControl>

                    <FormDescription className="text-xs">
                      Có thể để trống.
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="anhThumbnail"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Link ảnh thumbnail</FormLabel>

                    <FormControl>
                      <div className="relative">
                        <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />

                        <Input
                          placeholder="https://example.com/thumb.jpg"
                          {...field}
                          value={field.value || ""}
                          className="h-9 pl-10"
                        />
                      </div>
                    </FormControl>

                    <FormDescription className="text-xs">
                      Có thể để trống. Nếu có, card sẽ ưu tiên ảnh này.
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-1 md:col-span-2">
                <p className="text-sm font-medium">Xem trước ảnh</p>

                <div className="flex h-40 w-28 items-center justify-center overflow-hidden rounded-md border bg-slate-100">
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Preview ảnh truyện"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="px-2 text-center text-xs text-gray-400">
                      Chưa có ảnh
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Phân loại truyện
            </h3>

            <FormField
              control={form.control}
              name="theLoaiIds"
              render={({ field }) => {
                const selectedIds: number[] = Array.isArray(field.value)
                  ? uniqueIds(field.value)
                  : [];

                const genreList = Array.isArray(genres) ? genres : [];

                const genreOptions = Array.from(
                  new Map(
                    [
                      ...getSelectedGenresFromStory(data),
                      ...pickedGenreOptions,
                      ...genreList,
                    ].map((genre) => [genre.idTheLoai, genre]),
                  ).values(),
                );

                const selectedGenres = genreOptions.filter((genre) =>
                  selectedIds.includes(genre.idTheLoai),
                );

                const toggleGenre = (id: number) => {
                  if (selectedIds.includes(id)) {
                    field.onChange(selectedIds.filter((item) => item !== id));
                  } else {
                    const selectedGenre = genreList.find(
                      (genre) => genre.idTheLoai === id,
                    );

                    if (selectedGenre) {
                      setPickedGenreOptions((current) =>
                        current.some((genre) => genre.idTheLoai === id)
                          ? current
                          : [...current, selectedGenre],
                      );
                    }

                    field.onChange([...selectedIds, id]);
                  }
                };

                return (
                  <FormItem className="space-y-1">
                    <FormLabel>Thể loại</FormLabel>

                    <FormControl>
                      <div ref={genreBoxRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenGenreBox((prev) => !prev)}
                          className={`flex min-h-9 w-full items-center justify-between rounded-md border bg-white px-3 py-1.5 text-left text-sm transition ${
                            openGenreBox
                              ? "border-indigo-500 ring-2 ring-indigo-100"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex flex-1 flex-wrap gap-1.5">
                            {selectedGenres.length === 0 ? (
                              <span className="text-gray-400">
                                Chọn thể loại cho truyện
                              </span>
                            ) : (
                              selectedGenres.slice(0, 5).map((genre) => (
                                <span
                                  key={genre.idTheLoai}
                                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                                >
                                  {genre.tenTheLoai}

                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleGenre(genre.idTheLoai);
                                    }}
                                    className="rounded-full hover:bg-indigo-100"
                                  >
                                    <X className="h-3 w-3" />
                                  </span>
                                </span>
                              ))
                            )}

                            {selectedGenres.length > 5 && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                                +{selectedGenres.length - 5}
                              </span>
                            )}
                          </div>

                          <ChevronDown
                            className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition ${
                              openGenreBox ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {openGenreBox && (
                          <div className="absolute z-50 mt-1 w-full rounded-lg border bg-white p-2 shadow-lg">
                            <div className="relative mb-2">
                              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />

                              <Input
                                placeholder="Tìm thể loại..."
                                value={genreSearch}
                                onChange={(e) => setGenreSearch(e.target.value)}
                                className="h-9 pl-10"
                                autoFocus
                              />
                            </div>

                            <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
                              <span>Danh sách thể loại</span>
                              <span>{selectedIds.length} đã chọn</span>
                            </div>

                            <div className="max-h-36 overflow-y-auto rounded-md border bg-gray-50 p-1">
                              {genreList.length === 0 ? (
                                <p className="px-2 py-2 text-sm text-gray-500">
                                  Không tìm thấy thể loại
                                </p>
                              ) : (
                                genreList.map((genre) => {
                                  const checked = selectedIds.includes(
                                    genre.idTheLoai,
                                  );

                                  return (
                                    <button
                                      key={genre.idTheLoai}
                                      type="button"
                                      onClick={() =>
                                        toggleGenre(genre.idTheLoai)
                                      }
                                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${
                                        checked
                                          ? "bg-indigo-50 font-medium text-indigo-700"
                                          : "text-gray-700 hover:bg-white"
                                      }`}
                                    >
                                      <span>{genre.tenTheLoai}</span>

                                      {checked && (
                                        <Check className="h-4 w-4 text-indigo-600" />
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>

                            {selectedIds.length > 0 && (
                              <div className="mt-2 flex justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => field.onChange([])}
                                  className="h-8 text-xs"
                                >
                                  Bỏ chọn tất cả
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </FormControl>

                    <FormDescription className="text-xs">
                      Bấm vào ô chọn để mở danh sách thể loại.
                    </FormDescription>

                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-9 min-w-[90px]"
            >
              Hủy
            </Button>

            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
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
                  {data ? "Cập nhật" : "Thêm truyện"}
                </span>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
