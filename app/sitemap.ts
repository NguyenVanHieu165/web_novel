import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

function staticRoutes(siteUrl: string): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/truyen-moi`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/truyen-full`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/xep-hang`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/the-loai`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/blog`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/faq`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${siteUrl}/dieu-khoan`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/chinh-sach`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const routes = staticRoutes(siteUrl);

  try {
    const stories = await prisma.truyen.findMany({
      where: { isDeleted: false },
      orderBy: [{ updatedAt: "desc" }, { idTruyen: "desc" }],
      take: 50_000,
      select: {
        slug: true,
        updatedAt: true,
      },
    });

    return [
      ...routes,
      ...stories.map((story) => ({
        url: `${siteUrl}/truyen/${encodeURIComponent(story.slug)}`,
        ...(story.updatedAt ? { lastModified: story.updatedAt } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] Failed to load story URLs:", error);
    return routes;
  }
}
