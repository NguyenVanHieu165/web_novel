import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

import { getChapterDetail } from "@/lib/queries/chapter.query";
import { mapChapterDetail } from "@/lib/mappers/chapter.mapper";
import ReaderView from "@/components/chapter/ReaderView";
import { normalizeVietnameseText } from "@/lib/vietnamese-text";
import CommentSection from "@/components/comments/LazyCommentSection";
import { getChapterPath } from "@/lib/reader-navigation";

interface PageProps {
  params: Promise<{
    slug: string;
    chapterSlug: string;
  }>;
}

// 1. Dynamic SEO Metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, chapterSlug } = await params;
  const raw = await getChapterDetail(slug, chapterSlug);

  if (!raw) {
    return {
      title: "Không tìm thấy chương – WebNovel",
    };
  }

  const title = normalizeVietnameseText(`${raw.currentChapter.tieuDeChuong} – ${raw.story.tenTruyen} | WebNovel`);
  const description = normalizeVietnameseText(`Đọc chương ${raw.currentChapter.chuongSo} truyện ${raw.story.tenTruyen} trực tuyến tại WebNovel.`);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: raw.story.anhBia ? [{ url: raw.story.anhBia }] : [],
    },
  };
}

// 2. Server Component Page
export default async function ChapterReaderPage({ params }: PageProps) {
  const { slug, chapterSlug } = await params;
  const raw = await getChapterDetail(slug, chapterSlug);

  if (!raw) notFound();

  const data = mapChapterDetail(raw);
  if (!data) return notFound();

  if (data.access.canRead) {
    after(async () => {
      try {
        await prisma.$transaction([
          prisma.chuong.update({ where: { idChuong: data.chapter.idChuong }, data: { luotXem: { increment: 1 } } }),
          prisma.truyen.update({ where: { idTruyen: data.story.idTruyen }, data: { luotXem: { increment: 1 } } }),
        ]);
      } catch (error) {
        console.error("Không thể cập nhật lượt đọc chương", error);
      }
    });
  }

  return <><ReaderView key={data.chapter.idChuong} data={data} /><div className="mx-auto max-w-3xl px-4 pb-12"><CommentSection storySlug={data.story.slug} chapterId={data.chapter.idChuong} redirectPath={getChapterPath(data.story.slug, data.chapter.slug)} /></div></>;
}
