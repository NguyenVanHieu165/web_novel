import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { revalidatePublicStoryDetails } from "@/lib/server/public-cache";
import { requireUser } from "@/lib/server/auth-session";

import { createFollowNotifications, dispatchNotification } from "@/lib/server/notifications";

const paramsSchema = z.object({ slug: z.string().min(1).max(300) });
const followSchema = z.strictObject({ following: z.boolean() });
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ success: false, message: "Truyện không hợp lệ" }, { status: 400 });
    }

    const auth = request.cookies.get("token") ? await requireUser(request) : null;
    const accountId = auth?.authorized ? auth.user.idTaiKhoan : null;
    const story = await prisma.truyen.findFirst({
      where: { slug: parsedParams.data.slug, isDeleted: false },
      select: { idTruyen: true, _count: { select: { theoDoiTruyen: true } } },
    });
    if (!story) {
      return NextResponse.json({ success: false, message: "Không tìm thấy truyện" }, { status: 404 });
    }

    const follow = accountId === null ? null : await prisma.theoDoiTruyen.findUnique({
      where: { idTaiKhoan_idTruyen: { idTaiKhoan: accountId, idTruyen: story.idTruyen } },
      select: { idTheoDoiTruyen: true },
    });

    return NextResponse.json(
      { success: true, following: Boolean(follow), total: story._count.theoDoiTruyen },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("GET STORY FOLLOW ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể tải trạng thái theo dõi" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin !== null && origin !== request.nextUrl.origin)
  ) {
    return NextResponse.json({ success: false, message: "Yêu cầu theo dõi không hợp lệ" }, { status: 403 });
  }

  try {
    const auth = await requireUser(request);
    if (!auth.authorized) return auth.response;

    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = followSchema.safeParse(await request.json().catch(() => null));
    if (!parsedParams.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "Thông tin theo dõi không hợp lệ" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialize mutations for this story so the counter matches the relation count.
      const stories = await tx.$queryRaw<Array<{ idTruyen: number; tenTruyen: string }>>`
        SELECT idTRUYEN AS idTruyen, ten_truyen AS tenTruyen FROM truyen
        WHERE slug = ${parsedParams.data.slug} AND is_deleted = 0
        FOR UPDATE
      `;
      const story = stories[0];
      if (!story) return null;

      const where = { idTaiKhoan: auth.user.idTaiKhoan, idTruyen: story.idTruyen };
      let notification = null;
      if (parsedBody.data.following) {
        const inserted = await tx.theoDoiTruyen.createMany({
          data: [{ ...where, thong_bao_chuong_moi: true }],
          skipDuplicates: true,
        });
        if (inserted.count > 0) notification = await createFollowNotifications(tx, story, auth.user);
      } else {
        await tx.theoDoiTruyen.deleteMany({ where });
      }

      const total = await tx.theoDoiTruyen.count({ where: { idTruyen: story.idTruyen } });
      // Following is not a story edit; preserve its chapter-update timestamp.
      await tx.$executeRaw`UPDATE truyen SET luot_theo_doi = ${total} WHERE idTRUYEN = ${story.idTruyen}`;
      return { following: parsedBody.data.following, total, notification };
    });

    if (!result) {
      return NextResponse.json({ success: false, message: "Không tìm thấy truyện" }, { status: 404 });
    }
    revalidatePublicStoryDetails([parsedParams.data.slug]);
    await dispatchNotification(result.notification);
    return NextResponse.json({ success: true, following: result.following, total: result.total }, { headers: privateHeaders });
  } catch (error) {
    console.error("UPDATE STORY FOLLOW ERROR:", error);
    return NextResponse.json({ success: false, message: "Không thể cập nhật theo dõi. Vui lòng thử lại." }, { status: 500 });
  }
}
