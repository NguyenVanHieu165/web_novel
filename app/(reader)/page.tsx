import type { Metadata } from "next";
import { connection } from "next/server";

import HeroStory from "@/components/home/HeroStory";
import ContinueReading from "@/components/home/ContinueReading";
import NewStories from "@/components/home/NewStories";
import RecentlyUpdated from "@/components/home/RecentlyUpdated";
import HallOfFame from "@/components/home/HallOfFame";
import SmartGenreFilter from "@/components/home/SmartGenreFilter";
import UniverseShowcase from "@/components/home/UniverseShowcase";
import CompletedStories from "@/components/home/CompletedStories";
import BlogSection from "@/components/home/BlogSection";

import { getHomeData } from "@/lib/queries/home.query";
import { mapStory, mapRecentlyUpdated } from "@/lib/mappers/story.mapper";
import { getHomeGenres, mergeUniqueStories } from "@/lib/home-discovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: {
    absolute: "La Ca Truyện – Nền Tảng Đọc Truyện Chữ Đỉnh Cao",
  },
  description:
    "Nền tảng đọc truyện chữ trực tuyến miễn phí với hàng nghìn tác phẩm dịch, sáng tác và convert. Trải nghiệm hoạt họa 3D GSAP mượt mà đỉnh cao.",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/",
    siteName: "La Ca Truyện",
    title: "La Ca Truyện – Nền Tảng Đọc Truyện Chữ Đỉnh Cao",
    description:
      "Nền tảng đọc truyện chữ trực tuyến miễn phí với hàng nghìn tác phẩm dịch, sáng tác và convert.",
  },
};

export default async function ReaderHomePage() {
  // Prevent build-time rendering even when a hosting adapter evaluates routes.
  await connection();
  // 1. Lấy dữ liệu từ database qua query module
  const { featured, latest, updated, popular, rated, completed } = await getHomeData();

  // 2. Chuyển đổi dữ liệu sang format UI qua mapper module
  const newStories = latest.map((s) => mapStory(s, "moi"));
  const popularStories = popular.map((s) => mapStory(s, "hot"));
  const ratedStories = rated.map((s) => mapStory(s));
  const completedStories = completed.map((s) => mapStory(s, "full"));
  const featuredStory = featured ? mapStory(featured, "hot") : null;
  const heroStories = featuredStory
    ? [
        featuredStory,
        ...newStories.filter((story) => story.idTruyen !== featuredStory.idTruyen),
      ].slice(0, 5)
    : newStories.slice(0, 5);
  const discoveryStories = { latest: newStories, popular: popularStories, rated: ratedStories, completed: completedStories };
  const genreStories = mergeUniqueStories(newStories, popularStories, ratedStories, completedStories);
  const genreLinks = getHomeGenres(mergeUniqueStories(latest, popular, rated, completed));

  // Tác phẩm tâm điểm cho Universe Showcase (ưu tiên truyện featured, nếu không lấy truyện mới đầu tiên)
  const universeStory = featuredStory ?? newStories[0] ?? null;

  // Danh sách truyện mới cập nhật
  const updatedItems = updated.map(mapRecentlyUpdated);

  // 3. Render giao diện
  return (
    <div className="space-y-16">
      <h1 className="sr-only">La Ca Truyện – Nền tảng đọc truyện chữ trực tuyến</h1>

      {/* 1. Hero Showcase: 5-slide stacked coverflow */}
      <section id="hero-showcase">
        <HeroStory story={heroStories[0] ?? null} stories={heroStories} />
      </section>

      {/* 2. Continue Reading (Shows when logged in with history) */}
      <ContinueReading />

      {/* 3. Truyện Mới & Thịnh Hành: Stagger Reveal + GSAP Flip Tab Switching */}
      <NewStories collections={discoveryStories} />

      {/* Divider */}
      <div className="border-t border-slate-200/60 dark:border-zinc-800/60" />

      {/* 4. Top Bảng Xếp Hạng (Hall of Fame): Pin Horizontal Scroll with Scrub */}
      <HallOfFame stories={popularStories.length > 0 ? popularStories : newStories} />

      {/* Divider */}
      <div className="border-t border-slate-200/60 dark:border-zinc-800/60" />

      {/* 5. Khám phá kho truyện theo thể loại */}
      <SmartGenreFilter stories={genreStories} genres={genreLinks} />

      {/* Divider */}
      <div className="border-t border-slate-200/60 dark:border-zinc-800/60" />

      {/* 6. Siêu Phẩm Tuần (Universe Showcase): Multi-Layer 3D Parallax */}
      <UniverseShowcase story={universeStory} />

      {/* Divider */}
      <div className="border-t border-slate-200/60 dark:border-zinc-800/60" />

      {/* 7. Mới Cập Nhật */}
      <RecentlyUpdated items={updatedItems} />

      {/* Completed Stories (if any) */}
      {completedStories.length > 0 && (
        <CompletedStories stories={completedStories} />
      )}

      {/* 8. Blog & Review */}
      <BlogSection />
    </div>
  );
}
