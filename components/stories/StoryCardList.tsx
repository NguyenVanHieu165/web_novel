"use client";

import { Button } from "@/components/ui/button";
import axiosClient from "@/lib/axios";
import type { Story } from "@/hooks/useStories";
import { Edit2, Trash2, Eye, BookOpen, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

type CardProps = {
  data: Story[];
  onEdit: (story: Story) => void;
  refetch: () => void;
};

type ApiErrorResponse = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};

const statusLabels: Record<Story["trang_thai"], string> = {
  dang_tien_hanh: "Đang tiến hành",
  tam_dung: "Tạm dừng",
  hoan_thanh: "Hoàn thành",
  sap_ra_mat: "Sắp ra mắt",
};

export default function StoryCardList({ data, onEdit, refetch }: CardProps) {
  const router = useRouter();
  const [items, setItems] = useState<Story[]>(data);

  useEffect(() => {
    setItems(data);
  }, [data]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [movedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, movedItem);

    setItems(newItems);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa truyện này?")) return;

    const loadingToast = toast.loading("Đang xóa truyện...");

    try {
      const res = await axiosClient.delete(`/admin/stories/${id}`);

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Xóa truyện thất bại");
      }

      toast.dismiss(loadingToast);
      toast.success("Xóa truyện thành công");
      refetch();
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;

      toast.dismiss(loadingToast);
      toast.error(
        apiError.response?.data?.message || "Có lỗi xảy ra khi xóa truyện",
      );
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-b-lg border bg-white p-10 text-center text-black">
        Không có truyện nào để hiển thị.
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="story-cards" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {items.map((item, index) => (
              <Draggable
                key={item.idTruyen}
                draggableId={String(item.idTruyen)}
                index={index}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                      snapshot.isDragging ? "bg-blue-50 shadow-lg" : ""
                    }`}
                  >
                    <div className="mb-3 flex h-15 items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-gray-400">
                          #{item.idTruyen}
                        </p>
                        <h3 className="line-clamp-2 font-semibold text-slate-800">
                          {item.tenTruyen}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-fuchsia-100 px-2 py-1 text-xs font-medium text-fuchsia-700">
                          {statusLabels[item.trang_thai] || item.trang_thai}
                        </span>

                        <button
                          type="button"
                          {...provided.dragHandleProps}
                          className="cursor-grab text-gray-400 hover:text-gray-700"
                        >
                          <GripVertical className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-slate-100">
                      <img
                        src={item.anhThumbnail || item.anhBia || "/default.jpg"}
                        alt={item.tenTruyen}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>

                    <div className="mt-3 h-28 space-y-2 text-sm text-gray-600">
                      <p>
                        <span className="font-medium text-gray-700">
                          Thể loại:{" "}
                        </span>
                        {item.truyenTheLoai
                          ?.map((relation) => relation.theLoai?.tenTheLoai)
                          .filter(Boolean)
                          .join(", ") || "Chưa phân loại"}
                      </p>

                      <p>
                        <span className="font-medium text-gray-700">
                          Ngày tạo:{" "}
                        </span>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>

                      <p className="flex items-center gap-1">
                        <BookOpen className="h-4 w-4" />
                        Số chương: {item.soChuong ?? "Chưa cập nhật"}
                      </p>

                      <p className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        {item.luotXem} lượt xem
                      </p>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
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
                          router.push(`/admin/stories/${item.idTruyen}`)
                        }
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xem
                      </Button>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}

            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
