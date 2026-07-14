"use client";

import axiosClient from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { sort } from "fast-sort";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

export type Chapter = {
  idChuong: number;
  idTruyen?: number;
  chuongSo: string | number;
  tieuDeChuong: string;
  slug: string;
  isFree?: boolean | null;
  giaXu?: number | null;
  truyen?: {
    idTruyen?: number;
    tenTruyen?: string;
  };
};

type Props = {
  data: Chapter[];
  onEdit: (chapter: Chapter) => void;
  refresh: () => void;
};

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

type SortKey =
  | "idChuong"
  | "truyen"
  | "chuongSo"
  | "tieuDeChuong"
  | "slug"
  | "gia"
  | null;

type SortOrder = "asc" | "desc";

export default function ChapterTable({ data, onEdit, refresh }: Props) {
  const [items, setItems] = useState<Chapter[]>(data);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    setItems(data);
  }, [data]);

  const handleSort = (key: Exclude<SortKey, null>) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const cancelSort = () => {
    setSortKey(null);
    setSortOrder("asc");
  };

  const getSortIcon = (key: Exclude<SortKey, null>) => {
    if (sortKey !== key) return "↕";
    return sortOrder === "asc" ? "↑" : "↓";
  };

  const sortedData = useMemo(() => {
    if (sortKey === null) {
      return items;
    }

    const getValue = (item: Chapter) => {
      if (sortKey === "idChuong") return item.idChuong;
      if (sortKey === "truyen") return item.truyen?.tenTruyen || "";
      if (sortKey === "chuongSo") return Number(item.chuongSo) || 0;
      if (sortKey === "tieuDeChuong") return item.tieuDeChuong || "";
      if (sortKey === "slug") return item.slug || "";
      if (sortKey === "gia") return item.isFree ? 0 : (item.giaXu ?? 0);

      return "";
    };

    return sortOrder === "asc"
      ? sort(items).asc(getValue)
      : sort(items).desc(getValue);
  }, [items, sortKey, sortOrder]);

  const renderSortHeader = (
    label: string,
    sortName: Exclude<SortKey, null>,
  ) => {
    return (
      <button
        type="button"
        onClick={() => handleSort(sortName)}
        className="inline-flex items-center gap-1 font-semibold hover:text-blue-600"
      >
        {label}
        <span className="text-xs normal-case">{getSortIcon(sortName)}</span>
      </button>
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (sortKey !== null) {
      toast.warning("Hãy huỷ sắp xếp trước khi kéo thả");
      return;
    }

    if (!result.destination) return;

    const newItems = Array.from(items);
    const [movedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, movedItem);

    setItems(newItems);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa chương này?")) return;

    const loadingToast = toast.loading("Đang xóa chương...");

    try {
      const res = await axiosClient.delete(`/admin/chapter/${id}`);

      if (!res.data.success) {
        throw new Error(res.data.message || "Xóa thất bại");
      }

      toast.dismiss(loadingToast);
      toast.success("Xóa chương thành công");
      refresh();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      toast.dismiss(loadingToast);
      toast.error("Xóa chương thất bại", {
        description:
          apiError.response?.data?.message ||
          apiError.message ||
          "Có lỗi xảy ra",
      });
    }
  };

  return (
    <div>
      {sortKey !== null && (
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={cancelSort}
          >
            Huỷ sắp xếp
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full border-collapse text-left text-sm text-gray-800">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-10 border-b p-3"></th>
              <th className="border-b p-3">
                {renderSortHeader("ID", "idChuong")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Truyện", "truyen")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Số chương", "chuongSo")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Tiêu đề", "tieuDeChuong")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Slug", "slug")}
              </th>
              <th className="border-b p-3">{renderSortHeader("Giá", "gia")}</th>
              <th className="border-b p-3 text-right">Hành động</th>
            </tr>
          </thead>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="chapters">
              {(provided) => (
                <tbody ref={provided.innerRef} {...provided.droppableProps}>
                  {sortedData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-500">
                        Không có dữ liệu
                      </td>
                    </tr>
                  ) : (
                    sortedData.map((item, index) => (
                      <Draggable
                        key={item.idChuong}
                        draggableId={String(item.idChuong)}
                        index={index}
                        isDragDisabled={sortKey !== null}
                      >
                        {(provided, snapshot) => (
                          <tr
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`hover:bg-gray-50 ${
                              snapshot.isDragging ? "bg-blue-50" : ""
                            }`}
                          >
                            <td className="border-b p-3">
                              <button
                                type="button"
                                {...provided.dragHandleProps}
                                className={`text-gray-400 hover:text-gray-700 ${
                                  sortKey !== null
                                    ? "cursor-not-allowed opacity-40"
                                    : "cursor-grab"
                                }`}
                              >
                                <GripVertical className="h-4 w-4" />
                              </button>
                            </td>

                            <td className="border-b p-3 font-medium">
                              #{item.idChuong}
                            </td>

                            <td className="border-b p-3">
                              {item.truyen?.tenTruyen || "Không rõ truyện"}
                            </td>

                            <td className="border-b p-3">
                              {String(item.chuongSo)}
                            </td>

                            <td className="border-b p-3 font-medium">
                              {item.tieuDeChuong}
                            </td>

                            <td className="border-b p-3 text-gray-500">
                              {item.slug}
                            </td>

                            <td className="border-b p-3">
                              {item.isFree ? (
                                <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                                  Miễn phí
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                                  {item.giaXu ?? 0} xu
                                </span>
                              )}
                            </td>

                            <td className="border-b p-3">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onEdit(item)}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Sửa
                                </Button>

                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDelete(item.idChuong)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Xóa
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Draggable>
                    ))
                  )}

                  {provided.placeholder}
                </tbody>
              )}
            </Droppable>
          </DragDropContext>
        </table>
      </div>
    </div>
  );
}
