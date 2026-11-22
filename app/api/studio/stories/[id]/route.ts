import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertStudioOrigin, studioId, studioJson, studioRead, studioSuccess } from "@/lib/server/studio-http";
import { deleteStudioStory, updateStudioStory } from "@/lib/server/studio";
import { studioStoryUpdateSchema } from "@/schemas/studio.schema";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  return studioJson(request, studioStoryUpdateSchema, async (user, input) => studioSuccess(await updateStudioStory(prisma, user, studioId((await context.params).id), input)));
}

export async function DELETE(request: NextRequest, context: Context) {
  return studioRead(request, async (user) => {
    assertStudioOrigin(request);
    return studioSuccess(await deleteStudioStory(prisma, user, studioId((await context.params).id)));
  });
}
