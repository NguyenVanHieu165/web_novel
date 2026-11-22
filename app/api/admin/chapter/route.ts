import { GET as listChapters } from "../chapters/route";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { getRequestId, resSuccess } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-session";
import { saveWritingChapter } from "@/lib/server/chapter-writing";
import { writingChapterSchema } from "@/schemas/chapter-writing.schema";
import { readWritingJson, writingOriginError, writingErrorResponse } from "@/lib/server/chapter-document-http";

export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  if (params.has("search")) { if (!params.has("q")) params.set("q", params.get("search")!); params.delete("search"); }
  if (params.has("idTruyen")) { if (!params.has("storyId") && params.get("idTruyen") !== "all") params.set("storyId", params.get("idTruyen")!); params.delete("idTruyen"); }
  const url = new URL(req.url); url.search = params.toString();
  return listChapters(new NextRequest(url, req));
}
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) return auth.response;
  const originError = writingOriginError(req);
  if (originError) return originError;
  try {
    const values = writingChapterSchema.parse(await readWritingJson(req));
    if (values.idChuong) return NextResponse.json({ success: false, message: "Dùng endpoint cập nhật để sửa chương đã có." }, { status: 400 });
    const chapter = await saveWritingChapter(prisma, auth.user, values, "admin");
    revalidatePublicStories();
    return NextResponse.json(resSuccess({ message: "Đã lưu chương", data: chapter, requestId: getRequestId() }), { status: 201 });
  } catch (error) { return writingErrorResponse(error); }
}
