import { uploadImageToCloudinary } from "@/lib/cloudinary";
export const maxDuration = 60;
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { readerMutationSuccess, runReaderMutation } from "@/lib/server/reader-mutation";
import { readerProfileSchema } from "@/schemas/reader-account.schema";

export async function PUT(request: NextRequest) {
  return runReaderMutation(request, readerProfileSchema, async (idTaiKhoan, profile) => {
    const avatar = profile.avatar ? await uploadImageToCloudinary(profile.avatar, "web-novel/avatars") : null;
    const data = { ho_ten: profile.displayName, anh: avatar, updated_at: new Date() };
    await prisma.hoSoCaNhan.upsert({
      where: { idTaiKhoan },
      create: { idTaiKhoan, ...data },
      update: data,
      select: { idHoSoCaNhan: true },
    });

    return readerMutationSuccess("Đã lưu hồ sơ.");
  });
}
