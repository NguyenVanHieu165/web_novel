import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { studioId, studioRead, studioSuccess } from "@/lib/server/studio-http";
import { nextWritingChapterNumber } from "@/lib/server/chapter-writing";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return studioRead(request, async (user) => studioSuccess({ nextNumber: await nextWritingChapterNumber(prisma, user, studioId((await context.params).id), "studio") }));
}
