"use client";

import { Button } from "@/components/ui/button";
import axiosClient from "@/lib/axios";
import type { Story } from "@/hooks/useStories";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { Edit2, Eye, Trash2, GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { sort } from "fast-sort";

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

type StoryTableProps = {
  data: Story[];
  onEdit: (story: Story) => void;
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
  | "idTruyen"
  | "tenTruyen"
  | "trang_thai"
  | "createdAt"
  | "luotXem"
  | null;

type SortOrder = "asc" | "desc";

const statusLabels: Record<Story["trang_thai"], string> = {
  dang_tien_hanh: "Đang tiến hành",
  hoan_thanh: "Hoàn thành",
  tam_dung: "Tạm dừng",
  sap_ra_mat: "Sắp ra mắt",
};

export default function StoryTable({
  data = [],
  onEdit,
  refresh,
}: StoryTableProps) {
  const router = useRouter();

  const [items, setItems] = useState<Story[]>(data);
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

    const getValue = (item: Story) => {
      if (sortKey === "idTruyen") return item.idTruyen;
      if (sortKey === "tenTruyen") return item.tenTruyen || "";
      if (sortKey === "createdAt") return item.createdAt;
      if (sortKey === "luotXem") return item.luotXem;
      if (sortKey === "trang_thai") return statusLabels[item.trang_thai];

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
        className="flex items-center gap-1 font-semibold hover:text-blue-600"
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
    if (!confirm("Xóa truyện này?")) return;

    const loadingToast = toast.loading("Đang xoá truyện...");

    try {
      const res = await axiosClient.delete(`/admin/stories/${id}`);

      if (!res.data.success) {
        throw new Error(res.data.message || "Xóa thất bại");
      }

      toast.dismiss(loadingToast);
      toast.success("Xóa thành công", {
        description: "Truyện đã được chuyển vào thùng rác",
      });

      refresh();
    } catch (err: unknown) {
      const apiError = err as ApiErrorResponse;

      toast.dismiss(loadingToast);
      toast.error("Xóa thất bại", {
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
                {renderSortHeader("ID", "idTruyen")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Tên", "tenTruyen")}
              </th>
              <th className="border-b p-3">Thể loại</th>
              <th className="border-b p-3">
                {renderSortHeader("Trạng thái", "trang_thai")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Ngày tạo", "createdAt")}
              </th>
              <th className="border-b p-3">
                {renderSortHeader("Lượt xem", "luotXem")}
              </th>
              <th className="border-b p-3 text-right">Hành động</th>
            </tr>
          </thead>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="stories">
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
                        key={item.idTruyen}
                        draggableId={String(item.idTruyen)}
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
                              #{item.idTruyen}
                            </td>

                            <td className="border-b p-3 font-medium">
                              {item.tenTruyen}
                            </td>

                            <td className="border-b p-3">
                              {item.truyenTheLoai
                                ?.map(
                                  (relation) => relation.theLoai?.tenTheLoai,
                                )
                                .filter(Boolean)
                                .join(", ") || "Chưa phân loại"}
                            </td>

                            <td className="border-b p-3">
                              {statusLabels[item.trang_thai] || item.trang_thai}
                            </td>

                            <td className="border-b p-3">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </td>

                            <td className="border-b p-3">{item.luotXem}</td>

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
                                  onClick={() => handleDelete(item.idTruyen)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Xóa
                                </Button>

                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    router.push(
                                      `/admin/stories/${item.idTruyen}`,
                                    )
                                  }
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Xem
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
