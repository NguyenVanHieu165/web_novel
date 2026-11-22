"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import type { Chapter } from "./ChapterTable";
import ChapterPriceSheet from "./ChapterPriceSheet";

type Preview = Chapter & { content: string; wordCount: number; externalContent: boolean };
export default function ChapterPreview({ id, onClose, onEdit, onSuccess }: { id: number | null; onClose: () => void; onEdit: (chapter: Chapter) => void; onSuccess: () => void }) {
  const [state, setState] = useState<{ id: number; data?: Preview; error?: string } | null>(null);
  const [price, setPrice] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (id === null) return;
    const controller = new AbortController();
    api.get<{ success: boolean; data: Preview }>(`/admin/chapters/${id}/preview`, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setState(response.data.success ? { id, data: response.data.data } : { id, error: "Không thể tải nội dung chương" });
    }).catch(() => { if (!controller.signal.aborted) setState({ id, error: "Không thể tải nội dung. Hãy thử lại." }); });
    return () => controller.abort();
  }, [id, revision]);
  const current = state?.id === id ? state : null;
  const data = current?.data;
  return <>
    <Sheet open={id !== null} onOpenChange={(open) => { if (!open) { onClose(); setPrice(false); } }}><SheetContent className="!w-full !max-w-2xl overflow-y-auto overscroll-contain">
      <SheetHeader><SheetTitle>{data?.tieuDeChuong || "Xem trước chương"}</SheetTitle><SheetDescription>{data ? `${data.truyen?.tenTruyen} · Chương ${data.chuongSo} · ${data.giaXu ?? 0} xu · ${data.wordCount.toLocaleString("vi-VN")} chữ` : "Nội dung chương"}</SheetDescription></SheetHeader>
      {!current ? <p role="status" className="px-4">Đang tải nội dung…</p> : current.error ? <div role="alert" className="space-y-2 px-4"><p>{current.error}</p><Button onClick={() => setRevision((value) => value + 1)}>Thử lại</Button></div> : data && <div className="space-y-4 px-4 pb-8">
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { onClose(); onEdit(data); }}>Mở chỉnh sửa đầy đủ</Button><Button onClick={() => setPrice(true)}>Chỉnh giá VIP</Button><Button variant="outline" onClick={async () => {
          const response = await api.post("/admin/chapters/bulk", { action: "set-free", chapterIds: [data.idChuong] }).catch(() => null);
          if (response?.data.success) { setRevision((value) => value + 1); onSuccess(); } else setState({ id: data.idChuong, error: "Không thể cập nhật giá. Vui lòng thử lại." });
        }}>Chuyển miễn phí</Button></div>
        <article className="whitespace-pre-wrap break-words text-base leading-8">{data.content || (data.externalContent ? "Nội dung lưu ở tệp ngoài; không có văn bản trong cơ sở dữ liệu để xem trước." : "Chương chưa có nội dung.")}</article>
      </div>}
    </SheetContent></Sheet>
    <ChapterPriceSheet target={price && id ? { kind: "chapters", ids: [id] } : null} onClose={() => setPrice(false)} onSuccess={() => { setRevision((value) => value + 1); onSuccess(); }} />
  </>;
}
