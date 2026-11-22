import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { requireAdmin } from "@/lib/server/auth-session";
import { autoVipSchema } from "@/schemas/admin-chapters.schema";
import { liveChapterWhere } from "@/lib/server/admin-chapters";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== req.nextUrl.origin)) return NextResponse.json({ success: false }, { status: 403 });
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const parsed = autoVipSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Truyện, số chương hoặc giá xu không hợp lệ" }, { status: 400 });
  try {
    const { storyId, fromChapter, giaXu } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const story = await tx.truyen.findFirst({ where: { idTruyen: storyId, OR: [{ isDeleted: false }, { isDeleted: null }] }, select: { idTruyen: true } });
      if (!story) return null;
      return tx.chuong.updateMany({ where: { idTruyen: storyId, chuongSo: { gte: fromChapter }, ...liveChapterWhere }, data: { giaXu, isFree: false } });
    });
    if (!result) return NextResponse.json({ success: false, message: "Không tìm thấy truyện" }, { status: 404 });
    if (result.count) revalidatePublicStories();
    return NextResponse.json({ success: true, data: result });
  } catch (error) { console.error("AUTO VIP", error); return NextResponse.json({ success: false, message: "Không thể cấu hình VIP" }, { status: 500 }); }
}
