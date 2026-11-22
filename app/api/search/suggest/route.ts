import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({ q: z.string().transform(value => value.normalize("NFC").trim()).pipe(z.string().min(1).max(100)) });

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ stories: [], authors: [] });
  const q = parsed.data.q;
  try {
    const [stories, authors] = await Promise.all([
      prisma.truyen.findMany({
        where: { isDeleted: false, OR: [{ tenTruyen: { contains: q } }, { truyen_tac_gia_dich: { some: { tac_gia_dich: { ten: { contains: q } } } } }] },
        take: 5,
        orderBy: [{ luotXem: "desc" }, { idTruyen: "desc" }],
        select: { idTruyen: true, tenTruyen: true, slug: true, anhBia: true, soChuong: true, truyen_tac_gia_dich: { take: 1, select: { tac_gia_dich: { select: { ten: true } } } } },
      }),
      prisma.tacGiaDich.findMany({ where: { ten: { contains: q } }, take: 3, orderBy: { ten: "asc" }, select: { idTacGiaDich: true, ten: true } }),
    ]);
    return NextResponse.json({
      stories: stories.map(story => ({ id: story.idTruyen, title: story.tenTruyen, slug: story.slug, cover: story.anhBia, chapters: story.soChuong ?? 0, author: story.truyen_tac_gia_dich[0]?.tac_gia_dich.ten ?? "Chưa cập nhật" })),
      authors: authors.map(author => ({ id: author.idTacGiaDich, name: author.ten })),
    }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ success: false, message: "Không thể tải gợi ý tìm kiếm." }, { status: 500 });
  }
}
