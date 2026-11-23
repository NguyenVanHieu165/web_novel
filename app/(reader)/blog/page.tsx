import type { Metadata } from "next";

import { BLOG_POSTS } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Góc Độc Giả & Bình Luận",
  description: "Bài viết tuyển chọn, gợi ý và bình luận truyện dành cho cộng đồng La Ca Truyện.",
};

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-10 pb-16">
      <header className="space-y-3 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Góc độc giả</p>
        <h1 className="text-pretty text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
          Bài Viết & Bình Luận Truyện
        </h1>
        <p className="mx-auto max-w-2xl text-pretty text-slate-600 dark:text-zinc-400">
          Khám phá các chủ đề nổi bật và những góc nhìn dành cho người yêu truyện chữ.
        </p>
      </header>

      <div className="space-y-6">
        {BLOG_POSTS.map((post) => (
          <article
            id={post.slug}
            key={post.id}
            className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8"
          >
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <span>{post.category}</span>
              <time dateTime={post.date.split("/").reverse().join("-")} className="text-slate-400 dark:text-zinc-500">
                {post.date}
              </time>
            </div>
            <h2 className="text-pretty text-2xl font-black text-slate-950 dark:text-white">{post.title}</h2>
            <p className="mt-4 text-pretty leading-7 text-slate-600 dark:text-zinc-300">{post.description}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
