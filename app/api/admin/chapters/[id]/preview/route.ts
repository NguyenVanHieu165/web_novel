import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/auth-session";
import { chapterIdSchema } from "@/schemas/admin-chapters.schema";
import { chapterText, countChapterWords, liveChapterWhere } from "@/lib/server/admin-chapters";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const parsed = chapterIdSchema.safeParse((await params).id);
  if (!parsed.success) return NextResponse.json({ success: false, message: "ID chương không hợp lệ" }, { status: 400 });
  try {
    const chapter = await prisma.chuong.findFirst({ where: { idChuong: parsed.data, ...liveChapterWhere }, select: {
      idChuong: true, idTruyen: true, chuongSo: true, tieuDeChuong: true, slug: true, giaXu: true, isFree: true, createdAt: true,
      truyen: { select: { idTruyen: true, tenTruyen: true } }, noiDungChuong: { select: { noiDung: true, contentType: true, duongDanFile: true } },
    } });
    if (!chapter) return NextResponse.json({ success: false, message: "Không tìm thấy chương" }, { status: 404 });
    const content = chapterText(chapter.noiDungChuong?.noiDung);
    return NextResponse.json({ success: true, data: { ...chapter, noiDungChuong: { noiDung: content }, content, wordCount: countChapterWords(content), externalContent: Boolean(chapter.noiDungChuong?.duongDanFile && !content) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { console.error("PREVIEW CHAPTER", error); return NextResponse.json({ success: false, message: "Không thể tải nội dung chương" }, { status: 500 }); }
}
