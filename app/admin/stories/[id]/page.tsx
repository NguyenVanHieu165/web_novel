"use client";
import { useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Eye, BookOpen } from "lucide-react";

import StoryForm from "@/components/stories/StoryForm";
import { Button } from "@/components/ui/button";
import type { Story } from "@/hooks/useStories";
import { useStory } from "@/hooks/useStory";
const statusLabels: Record<Story["trang_thai"], string> = {
  dang_tien_hanh: "Đang tiến hành",
  tam_dung: "Tạm dừng",
  hoan_thanh: "Hoàn thành",
  sap_ra_mat: "Sắp ra mắt",
};

export default function StoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { story, loading, fetchStory } = useStory(Number(params.id));
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (loading) {
    return <div className="p-6 text-slate-500">Đang tải...</div>;
  }

  if (!story) {
    return (
      <div className="p-6">
        <p className="mb-4 text-slate-500">Không tìm thấy truyện.</p>
        <Button variant="outline" onClick={() => router.back()}>
          Quay lại
        </Button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl">
          <Button
            type="button"
            variant="outline"
            className="mb-4"
            onClick={() => setEditing(false)}
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại chi tiết
          </Button>

          <StoryForm
            data={story}
            onClose={() => setEditing(false)}
            onSuccess={async () => {
              await fetchStory();
              setEditing(false);
            }}
          />
        </div>
      </div>
    );
  }

  const imageUrl = story.anhThumbnail || story.anhBia || "/default.jpg";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>

          <Button onClick={() => setEditing(true)}>
            <Edit2 className="h-4 w-4" />
            Chỉnh sửa
          </Button>
        </div>

        <div className="grid gap-8 rounded-xl border bg-white p-6 shadow-sm lg:grid-cols-[400px_1fr]">
          <div className="overflow-hidden rounded-xl border bg-slate-100 p-2">
            <Image
              src={imageUrl}
              alt={story.tenTruyen}
              width={400}
              height={600}
              unoptimized
              loading="eager"
              className="block h-auto w-full rounded-lg object-contain"
            />
          </div>

          <div>
            <h1 className="mb-3 text-3xl font-bold text-slate-900">
              {story.tenTruyen}
            </h1>

            <div className="mb-4 flex flex-wrap gap-2">
              {story.truyenTheLoai && story.truyenTheLoai.length > 0 ? (
                story.truyenTheLoai.map((item) => (
                  <span
                    key={item.idTheLoai}
                    className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-700"
                  >
                    {item.theLoai?.tenTheLoai || "Không rõ"}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">Chưa phân loại</span>
              )}
            </div>

            <div className="grid gap-3 text-slate-700 sm:grid-cols-2">
              <p>
                <strong>Trạng thái:</strong>{" "}
                {story.trang_thai
                  ? statusLabels[story.trang_thai] || story.trang_thai
                  : "Chưa cập nhật"}
              </p>

              <p className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <strong>Lượt xem:</strong>{" "}
                {(story.luotXem ?? 0).toLocaleString("vi-VN")}
              </p>

              <p className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                <strong>Số chương:</strong> {story.soChuong ?? "Chưa cập nhật"}
              </p>

              <p>
                <strong>Ngày tạo:</strong>{" "}
                {story.createdAt
                  ? new Date(story.createdAt).toLocaleDateString("vi-VN")
                  : "Chưa cập nhật"}
              </p>
            </div>

            {story.moTa && (
              <div className="mt-8">
                <h2 className="mb-3 text-xl font-semibold text-slate-900">
                  Giới thiệu
                </h2>

                <div className="whitespace-pre-line rounded-lg border bg-slate-50 p-4 leading-7 text-slate-700">
                  {story.moTa}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
