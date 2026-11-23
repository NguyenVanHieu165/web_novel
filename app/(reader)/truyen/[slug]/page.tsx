import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getStoryDetailPageBySlug } from "@/lib/queries/story-detail.query";
import { getChapterPath } from "@/lib/reader-navigation";
import ContinueReadingAction from "@/components/story/detail/ContinueReadingAction";
import StoryDetailHeader from "@/components/story/detail/StoryDetailHeader";
import StoryDetailTabs from "@/components/story/detail/StoryDetailTabs";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

// 1. Dynamic SEO Metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getStoryDetailPageBySlug(slug);

  if (!data) {
    return {
      title: "Không tìm thấy truyện – WebNovel",
      description: "Tác phẩm bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.",
    };
  }

  const rawStory = data.metadata;
  const title = `${rawStory.tenTruyen} – Đọc Truyện Online Hay Nhất | WebNovel`;
  const description =
    rawStory.moTa?.slice(0, 160) ||
    `Đọc truyện ${rawStory.tenTruyen} online miễn phí chất lượng cao tại WebNovel.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: rawStory.anhBia ? [{ url: rawStory.anhBia }] : [],
    },
  };
}

// 2. Server Component Page
export default async function StoryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getStoryDetailPageBySlug(slug);
  if (!data) notFound();
  const { story } = data;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Story Header with 3D Tilt Cover & Action Buttons */}
      <StoryDetailHeader
        story={story}
        readingAction={story.firstChapterSlug ? (
          <ContinueReadingAction
            storySlug={story.slug}
            firstChapterHref={getChapterPath(story.slug, story.firstChapterSlug)}
          />
        ) : undefined}
      />

      {/* 2. Story Tabs: Synopsis, Chapters, Reviews & Comments */}
      <StoryDetailTabs story={story} />
    </div>
  );
}
