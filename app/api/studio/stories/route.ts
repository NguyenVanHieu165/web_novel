import { uploadImageToCloudinary } from "@/lib/cloudinary";
export const maxDuration = 60;
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
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
  return studioJson(request, studioStorySchema, async (user, input) => {
    const anhBia = input.anhBia ? await uploadImageToCloudinary(input.anhBia) : "";
    const story = await createStudioStory(prisma, user, { ...input, anhBia });
    revalidatePublicStories([story.slug], true);
    return studioSuccess(story, 201);
  });
}
