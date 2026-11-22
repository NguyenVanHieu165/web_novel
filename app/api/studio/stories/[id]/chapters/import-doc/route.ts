import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertStudioOrigin, studioId, studioJson, studioRead, studioSuccess } from "@/lib/server/studio-http";
import { assertStudioStoryAccess, ensureStudioDatabase, StudioAccessError } from "@/lib/server/studio-ownership";
import { importWritingChapters } from "@/lib/server/chapter-writing";
import { previewChapterDocument } from "@/lib/server/chapter-document-http";
import { chapterImportSchema } from "@/schemas/chapter-writing.schema";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return studioRead(request, async (user) => {
      assertStudioOrigin(request);
      await ensureStudioDatabase(prisma);
      await assertStudioStoryAccess(prisma, user, studioId((await context.params).id));
      return studioSuccess(await previewChapterDocument(request));
    });
  }
  return studioJson(request, chapterImportSchema, async (user, input) => {
    if (input.idTruyen !== studioId((await context.params).id)) throw new StudioAccessError("Truyện không khớp với URL.", 400, "INVALID_STORY");
    return studioSuccess(await importWritingChapters(prisma, user, input, "studio"), 201);
  });
}
