import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { studioJson, studioRead, studioSuccess } from "@/lib/server/studio-http";
import { createStudioStory, listStudioStories } from "@/lib/server/studio";
import { studioPaginationSchema, studioStorySchema } from "@/schemas/studio.schema";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return studioRead(request, async (user) => {
    const query = studioPaginationSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return studioSuccess(await listStudioStories(prisma, user, query.page, query.pageSize));
  });
}

export async function POST(request: NextRequest) {
  return studioJson(request, studioStorySchema, async (user, input) => studioSuccess(await createStudioStory(prisma, user, input), 201));
}
