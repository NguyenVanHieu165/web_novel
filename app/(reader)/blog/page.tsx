import type { Metadata } from "next";

import { BLOG_POSTS } from "@/lib/blog-posts";
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Góc Độc Giả & Bình Luận",
  description: "Bài viết tuyển chọn, gợi ý và bình luận truyện dành cho cộng đồng La Ca Truyện.",
};

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-10 pb-16">
      <PageHeader className="justify-center text-center sm:items-center">
        <PageHeaderContent>
        <PageHeaderEyebrow className="text-primary">Góc độc giả</PageHeaderEyebrow>
        <PageHeaderTitle className="text-3xl sm:text-5xl">Bài Viết & Bình Luận Truyện</PageHeaderTitle>
        <PageHeaderDescription className="mx-auto">
          Khám phá các chủ đề nổi bật và những góc nhìn dành cho người yêu truyện chữ.
        </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="space-y-6">
        {BLOG_POSTS.map((post) => (
          <Card
            id={post.slug}
            key={post.id}
            className="scroll-mt-24 rounded-3xl"
          >
            <CardHeader>
            <div className="mb-1 flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-wider">
              <Badge variant="info">{post.category}</Badge>
              <time dateTime={post.date.split("/").reverse().join("-")} className="text-muted-foreground">
                {post.date}
              </time>
            </div>
            <CardTitle className="text-2xl font-black">{post.title}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-pretty leading-7 text-muted-foreground">{post.description}</p></CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
