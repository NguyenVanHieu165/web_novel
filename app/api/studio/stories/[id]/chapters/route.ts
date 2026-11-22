import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { studioId, studioJson, studioRead, studioSuccess } from "@/lib/server/studio-http";
import { getStudioChapter, listStudioChapters } from "@/lib/server/studio";
import { saveWritingChapter } from "@/lib/server/chapter-writing";
import { StudioAccessError } from "@/lib/server/studio-ownership";
import { studioPaginationSchema } from "@/schemas/studio.schema";
import { writingChapterSchema } from "@/schemas/chapter-writing.schema";

type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: Context) {
  return studioRead(request, async (user) => {
    const storyId = studioId((await context.params).id);
    const chapterId = request.nextUrl.searchParams.get("chapterId");
    if (chapterId !== null) return studioSuccess(await getStudioChapter(prisma, user, storyId, studioId(chapterId)));
    const query = studioPaginationSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return studioSuccess(await listStudioChapters(prisma, user, storyId, query.page, query.pageSize));
  });
}

export async function POST(request: NextRequest, context: Context) {
  return studioJson(request, writingChapterSchema, async (user, input) => {
    if (input.idTruyen !== studioId((await context.params).id) || input.idChuong !== undefined) {
      throw new StudioAccessError("Thông tin truyện/chương không khớp.", 400, "INVALID_CHAPTER");
    }
    const chapter = await saveWritingChapter(prisma, user, input, "studio");
    revalidatePublicStories();
    return studioSuccess(chapter, 201);
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return studioJson(request, writingChapterSchema, async (user, input) => {
    if (input.idTruyen !== studioId((await context.params).id) || input.idChuong === undefined) {
      throw new StudioAccessError("Cần chọn đúng chương để chỉnh sửa.", 400, "INVALID_CHAPTER");
    }
    const chapter = await saveWritingChapter(prisma, user, input, "studio");
    revalidatePublicStories();
    return studioSuccess(chapter);
  });
}
