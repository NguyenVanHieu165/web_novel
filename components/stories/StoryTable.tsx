"use client";

import { Button } from "@/components/ui/button";
import axiosClient from "@/lib/axios";
import type { Story } from "@/hooks/useStories";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { sort } from "fast-sort";
import ChapterCountBadges from "./ChapterCountBadges";
import type { AdminStorySort } from "@/schemas/admin-story-query.schema";
import { useReorderedItems } from "@/hooks/useReorderedItems";
import { Edit2, Eye, Trash2, GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

type StoryTableProps = {
  data: (Story & { soChuongVip?: number })[];
  sortBy?: AdminStorySort;
  sortOrder?: "asc" | "desc";
  onSort?: (key: AdminStorySort) => void;
  onResetSort?: () => void;
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

const EMPTY_STORIES: Story[] = [];

const statusLabels: Record<Story["trang_thai"], string> = {
  dang_tien_hanh: "Đang tiến hành",
  hoan_thanh: "Hoàn thành",
  tam_dung: "Tạm dừng",
  sap_ra_mat: "Sắp ra mắt",
};

export default function StoryTable({
  data = EMPTY_STORIES,
  onEdit,
  refresh,
  sortBy: serverSortBy, sortOrder: serverSortOrder, onSort, onResetSort,
}: StoryTableProps) {
  const router = useRouter();

  const { items, reorder } = useReorderedItems(data);
  const [localSort, setLocalSort] = useState<{ key: AdminStorySort | null; order: "asc" | "desc" }>({ key: null, order: "asc" });
  const sortBy = onSort ? serverSortBy : localSort.key;
  const sortOrder = onSort ? serverSortOrder : localSort.order;
  const handleSort = (key: AdminStorySort) => {
    if (onSort) onSort(key);
    else setLocalSort({ key, order: localSort.key === key && localSort.order === "asc" ? "desc" : "asc" });
  };
  const resetSort = () => { if (onResetSort) onResetSort(); else setLocalSort({ key: null, order: "asc" }); };
  const sortedData = useMemo(() => {
    if (onSort || !localSort.key) return items;
    const value = (item: Story) => {
      switch (localSort.key) {
        case "id": return item.idTruyen;
        case "tenTruyen": return item.tenTruyen;
        case "soChuong": return item.soChuong ?? 0;
        case "luotXem": return item.luotXem;
        case "ngayTao": return item.createdAt;
        case "trang_thai": return statusLabels[item.trang_thai];
        default: return "";
      }
    };
    return localSort.order === "asc" ? sort(items).asc(value) : sort(items).desc(value);
  }, [items, localSort, onSort]);
  const isSorted = onSort ? sortBy !== "ngayTao" || sortOrder !== "desc" : localSort.key !== null;
  const getSortIcon = (key: AdminStorySort) => sortBy === key ? (sortOrder === "asc" ? "↑" : "↓") : "↕";

  const renderSortHeader = (
    label: string,
    sortName: AdminStorySort,
  ) => {
    return (
      <button
        type="button"
        onClick={() => handleSort(sortName)}
        className="flex items-center gap-1 font-semibold hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <span className="text-xs normal-case" aria-hidden="true">{getSortIcon(sortName)}</span>
      </button>
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (isSorted) {
      toast.warning("Hãy huỷ sắp xếp trước khi kéo thả");
      return;
    }

    if (!result.destination) return;

    reorder(result.source.index, result.destination.index);
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
      {isSorted && (
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetSort}
          >
            Huỷ sắp xếp
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-left text-sm text-card-foreground">
          <thead className="bg-muted text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 border-b p-3"></th>
              <th scope="col" className="border-b p-3" aria-sort={sortBy === "id" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
                {renderSortHeader("ID", "id")}
              </th>
              <th scope="col" className="border-b p-3" aria-sort={sortBy === "tenTruyen" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
                {renderSortHeader("Tên", "tenTruyen")}
              </th>
              <th className="border-b p-3">Thể loại</th>
              <th scope="col" className="border-b p-3" aria-sort={sortBy === "trang_thai" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
                {renderSortHeader("Trạng thái", "trang_thai")}
              </th>
              <th scope="col" className="border-b p-3" aria-sort={sortBy === "ngayTao" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
                {renderSortHeader("Ngày tạo", "ngayTao")}
              </th>
              <th scope="col" className="border-b p-3" aria-sort={sortBy === "luotXem" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
                {renderSortHeader("Lượt xem", "luotXem")}
              </th>
              <th scope="col" className="border-b p-3" aria-sort={sortBy === "soChuong" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}>
                {renderSortHeader("Số chương", "soChuong")}
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
                      <td colSpan={9} className="p-6 text-center text-gray-500">
                        Không có dữ liệu
                      </td>
                    </tr>
                  ) : (
                    sortedData.map((item, index) => (
                      <Draggable
                        key={item.idTruyen}
                        draggableId={String(item.idTruyen)}
                        index={index}
                        isDragDisabled={isSorted}
                      >
                        {(provided, snapshot) => (
                          <tr
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`hover:bg-muted/50 ${
                              snapshot.isDragging ? "bg-blue-50" : ""
                            }`}
                          >
                            <td className="border-b p-3">
                              <button
                                type="button"
                                aria-label={`Đổi vị trí truyện ${item.tenTruyen}`}
                                {...provided.dragHandleProps}
                                className={`text-gray-400 hover:text-gray-700 ${
                                  isSorted
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

                            <td className="border-b p-3"><ChapterCountBadges count={item.soChuong} vipCount={item.soChuongVip} /></td>
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
