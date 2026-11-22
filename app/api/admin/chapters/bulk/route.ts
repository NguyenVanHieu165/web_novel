import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { chapterBulkSchema } from "@/schemas/admin-chapters.schema";
import { ChapterMutationError, mutateChapters } from "@/lib/server/admin-chapters";
import { revalidatePublicStories } from "@/lib/server/public-cache";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== req.nextUrl.origin)) return NextResponse.json({ success: false }, { status: 403 });
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const parsed = chapterBulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Thao tác, danh sách chương hoặc giá xu không hợp lệ" }, { status: 400 });
  try {
    const data = await mutateChapters(parsed.data);
    revalidatePublicStories();
    return NextResponse.json({ success: true, data });
  }
  catch (error) { console.error("BULK CHAPTERS", error); return NextResponse.json({ success: false, message: error instanceof ChapterMutationError ? error.message : "Không thể cập nhật chương; chưa lưu thay đổi" }, { status: error instanceof ChapterMutationError ? error.status : 500 }); }
}
