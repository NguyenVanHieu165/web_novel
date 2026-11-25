"use client";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/axios";
import { MAX_CHAPTER_PRICE } from "@/schemas/admin-chapters.schema";
import { toast } from "sonner";

type Target = { kind: "chapters"; ids: number[] } | { kind: "story"; storyId: number };
export default function ChapterPriceSheet({ target, onClose, onSuccess }: { target: Target | null; onClose: () => void; onSuccess: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Sheet open={target !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}><SheetContent className="!w-full !max-w-md">
    <SheetHeader><SheetTitle>{target?.kind === "story" ? "Cấu hình VIP nhanh" : "Đặt giá VIP"}</SheetTitle><SheetDescription>{target?.kind === "story" ? "Áp dụng cho các chương hiện có từ số chương đã chọn trở đi." : `Áp dụng cho ${target?.ids.length ?? 0} chương đã chọn.`}</SheetDescription></SheetHeader>
    <form className="space-y-4 px-4" onSubmit={async (event) => {
      event.preventDefault(); if (!target || busy) return;
      const form = new FormData(event.currentTarget); setBusy(true); setError("");
      try {
        const response = target.kind === "story" ? await api.post("/admin/chapters/auto-vip", { storyId: target.storyId, fromChapter: Number(form.get("fromChapter")), giaXu: Number(form.get("giaXu")) }) : await api.post("/admin/chapters/bulk", { action: "set-vip", chapterIds: target.ids, giaXu: Number(form.get("giaXu")) });
        if (!response.data.success) throw new Error(response.data.message || "Không thể cập nhật");
        toast.success(`Đã cập nhật ${response.data.data.count} chương`); onSuccess(); onClose();
      } catch { setError("Không thể đặt giá VIP. Kiểm tra dữ liệu và thử lại."); } finally { setBusy(false); }
    }}>
      {target?.kind === "story" && <label className="block space-y-1"><span>Từ chương</span><Input name="fromChapter" type="number" min="0" max="999999.9" step="0.1" defaultValue="1" required disabled={busy} /></label>}
      <label className="block space-y-1"><span>Giá VIP (xu)</span><Input name="giaXu" type="number" min="1" max={MAX_CHAPTER_PRICE} step="1" defaultValue="5" required disabled={busy} /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Áp dụng giá VIP"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Hủy</Button></div>
    </form>
  </SheetContent></Sheet>;
}
