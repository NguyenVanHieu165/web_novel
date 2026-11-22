"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/axios";
import { toast } from "sonner";
import { useCollaborativeEditor } from "@/hooks/useCollaborativeEditor";
import CollaborationSwitch from "@/components/editor/CollaborationSwitch";
import StoryChapterEditor from "./StoryChapterEditor";
import { emptyWritingChapter, type WritingChapter } from "./chapter-editor-state";

type ChapterData = {
  idChuong: number; idTruyen?: number; chuongSo?: string | number;
  tieuDeChuong?: string; slug?: string; isFree?: boolean | null; giaXu?: number | null; isDeleted?: boolean | null;
  truyen?: { idTruyen?: number; tenTruyen?: string } | null;
  noiDungChuong?: { noiDung?: string | null } | null;
};
type Props = { data?: ChapterData | null; stories: { idTruyen: number; tenTruyen: string }[]; storyId?: number; onClose: () => void; onSuccess: () => void };
const nextNumberUrl = (storyId: number) => `/api/admin/chapter/next-number?storyId=${storyId}`;
const importUrl = () => "/api/admin/chapter/import-doc";

export default function ChapterForm({ data, stories, storyId, onClose, onSuccess }: Props) {
  const [accountId, setAccountId] = useState(0);
  const [sessionError, setSessionError] = useState("");
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [collabSeed, setCollabSeed] = useState(data?.noiDungChuong?.noiDung ?? "");
  const [collabAvailable, setCollabAvailable] = useState(!!data);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<WritingChapter | null>(null);
  const actionsRef = useRef<{ replaceContent: (content: string) => void } | null>(null);
  const idTruyen = data?.idTruyen ?? data?.truyen?.idTruyen ?? storyId ?? stories[0]?.idTruyen ?? 0;
  const options = data?.truyen?.tenTruyen && !stories.some(story => story.idTruyen === idTruyen)
    ? [{ idTruyen, tenTruyen: data.truyen.tenTruyen }, ...stories] : stories;
  const initial: WritingChapter = data ? {
    idChuong: data.idChuong, idTruyen, chuongSo: Number(data.chuongSo ?? 1), tieuDeChuong: data.tieuDeChuong ?? "", slug: data.slug ?? "",
    noiDung: data.noiDungChuong?.noiDung ?? "", isFree: data.isFree ?? true, giaXu: data.giaXu ?? 0, publication: data.isDeleted ? "draft" : "published",
  } : emptyWritingChapter(idTruyen);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body: { user?: { idTaiKhoan: number; tenTaiKhoan: string }; message?: string } = await response.json();
      if (!response.ok || !body.user) throw new Error(body.message || "Không xác nhận được phiên quản trị.");
      if (!controller.signal.aborted) { setAccountId(body.user.idTaiKhoan); setAuthorName(body.user.tenTaiKhoan); }
    }).catch(cause => { if (!controller.signal.aborted) setSessionError(cause instanceof Error ? cause.message : "Không thể tải phiên đăng nhập."); });
    return () => controller.abort();
  }, []);
  const { onlineUsers, isConnected, saveStatus, getContent } = useCollaborativeEditor({
    chapterId: data?.idChuong ?? 0, initialContent: collabSeed,
    enabled: collabEnabled, userName: authorName, editorContainerRef,
  });
  async function save(value: WritingChapter, writeNext: boolean) {
    try {
      if (value.idChuong) await api.put(`/admin/chapter/${value.idChuong}`, value);
      else await api.post("/admin/chapter", value);
    } catch (cause) {
      const error = cause as { response?: { data?: { message?: string } }; message?: string };
      throw new Error(error.response?.data?.message || error.message || "Không thể lưu chương.");
    }
    toast.success(value.publication === "draft" ? "Đã lưu bản nháp" : "Đã xuất bản chương");
    if (writeNext) { setCollabEnabled(false); setCollabAvailable(false); }
    onSuccess();
    if (!writeNext) onClose();
  }
  if (sessionError) return <p role="alert" className="p-4 text-red-600">{sessionError}</p>;
  if (!accountId) return <p role="status" className="p-4">Đang mở không gian viết…</p>;
  return <div className="overflow-y-auto px-4 pb-4"><StoryChapterEditor
    key={data?.idChuong ?? `new-${idTruyen}`} accountId={accountId} stories={options} initial={initial} draftRef={draftRef} actionsRef={actionsRef}
    nextNumberUrl={nextNumberUrl} importUrl={importUrl} onSave={save} onImported={onSuccess} onCancel={onClose}
    collaboration={{
      controls: <CollaborationSwitch enabled={collabEnabled} onToggle={enabled => { if (enabled) setCollabSeed(draftRef.current?.noiDung ?? initial.noiDung); else actionsRef.current?.replaceContent(getContent()); setCollabEnabled(enabled); }} isConnected={isConnected} onlineUsers={onlineUsers} saveStatus={saveStatus} disabled={!collabAvailable} />,
      content: collabEnabled ? <div ref={editorContainerRef} aria-label="Nội dung chương cộng tác" className="min-h-[460px] rounded-lg border p-2 [&_.cm-scroller]:font-sans [&_.cm-content]:leading-8" /> : undefined,
      getContent: collabEnabled ? getContent : undefined,
    }}
  /></div>;
}
