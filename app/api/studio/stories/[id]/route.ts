import { assertStudioStoryAccess } from "@/lib/server/studio-ownership";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
export const maxDuration = 60;
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePublicStories } from "@/lib/server/public-cache";
import { assertStudioOrigin, studioId, studioJson, studioRead, studioSuccess } from "@/lib/server/studio-http";
import { deleteStudioStory, updateStudioStory } from "@/lib/server/studio";
import { studioStoryUpdateSchema } from "@/schemas/studio.schema";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  return studioJson(request, studioStoryUpdateSchema, async (user, input) => {
    const id = studioId((await context.params).id);
    await assertStudioStoryAccess(prisma, user, id);
    const anhBia = input.anhBia ? await uploadImageToCloudinary(input.anhBia) : input.anhBia;
    const story = await updateStudioStory(prisma, user, id, { ...input, anhBia });
    revalidatePublicStories([story.slug]);
    return studioSuccess(story);
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return studioRead(request, async (user) => {
    assertStudioOrigin(request);
    const result = await deleteStudioStory(prisma, user, studioId((await context.params).id));
    revalidatePublicStories(undefined, true);
    return studioSuccess(result);
  });
}
