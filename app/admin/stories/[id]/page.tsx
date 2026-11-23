"use client";
import { useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Eye, BookOpen } from "lucide-react";

import StoryForm from "@/components/stories/StoryForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, EmptyStateActions, EmptyStateDescription, EmptyStateTitle } from "@/components/shared/empty-state";
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/components/shared/page-header";
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
    return <div role="status" className="p-6 text-muted-foreground">Đang tải…</div>;
  }

  if (!story) {
    return (
      <EmptyState><EmptyStateTitle>Không tìm thấy truyện</EmptyStateTitle><EmptyStateDescription>Truyện có thể đã bị xóa hoặc bạn không còn quyền truy cập.</EmptyStateDescription><EmptyStateActions><Button variant="outline" onClick={() => router.back()}>Quay lại</Button></EmptyStateActions></EmptyState>
    );
  }

  if (editing) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-3xl">
          <Button
            type="button"
            variant="outline"
            className="mb-4"
            onClick={() => setEditing(false)}
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <PageHeader className="mb-6">
          <PageHeaderContent>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Quay lại
          </Button>
          <PageHeaderTitle>{story.tenTruyen}</PageHeaderTitle>
          <PageHeaderDescription>Thông tin chi tiết và trạng thái xuất bản của truyện.</PageHeaderDescription>
          </PageHeaderContent>
          <PageHeaderActions>
          <Button onClick={() => setEditing(true)}>
            <Edit2 aria-hidden="true" className="h-4 w-4" />
            Chỉnh sửa
          </Button>
          </PageHeaderActions>
        </PageHeader>

        <Card><CardContent className="grid gap-8 p-6 lg:grid-cols-[400px_1fr]">
          <div className="overflow-hidden rounded-xl border bg-muted p-2">
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
            <div className="mb-4 flex flex-wrap gap-2">
              {story.truyenTheLoai && story.truyenTheLoai.length > 0 ? (
                story.truyenTheLoai.map((item) => (
                  <Badge key={item.idTheLoai} variant="secondary">
                    {item.theLoai?.tenTheLoai || "Không rõ"}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Chưa phân loại</span>
              )}
            </div>

            <div className="grid gap-3 text-foreground sm:grid-cols-2">
              <p>
                <strong>Trạng thái:</strong>{" "}
                {story.trang_thai
                  ? statusLabels[story.trang_thai] || story.trang_thai
                  : "Chưa cập nhật"}
              </p>

              <p className="flex items-center gap-1">
                <Eye aria-hidden="true" className="h-4 w-4" />
                <strong>Lượt xem:</strong>{" "}
                {(story.luotXem ?? 0).toLocaleString("vi-VN")}
              </p>

              <p className="flex items-center gap-1">
                <BookOpen aria-hidden="true" className="h-4 w-4" />
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
                <h2 className="mb-3 text-xl font-semibold">
                  Giới thiệu
                </h2>

                <div className="whitespace-pre-line rounded-lg border bg-muted/40 p-4 leading-7 text-foreground">
                  {story.moTa}
                </div>
              </div>
            )}
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
