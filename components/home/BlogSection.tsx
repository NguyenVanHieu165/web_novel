"use client";

import { useRef } from "react";
import SectionHeader from "@/components/common/SectionHeader";
import BlogCard from "@/components/blog/BlogCard";
import { gsap, useGSAP } from "@/lib/gsap";
import { BLOG_POSTS } from "@/lib/blog-posts";

export default function BlogSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;

      gsap.from(".blog-card-item", {
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
          once: true,
        },
        opacity: 0,
        y: 50,
        scale: 0.95,
        duration: 0.7,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "transform,opacity",
      });
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="py-2">
      <SectionHeader title="Góc Độc Giả & Bình Luận" href="/blog" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {BLOG_POSTS.map((blog) => (
          <BlogCard
            key={blog.id}
            thumbnail={blog.thumbnail}
            category={blog.category}
            title={blog.title}
            description={blog.description}
            date={blog.date}
            href={`/blog#${blog.slug}`}
          />
        ))}
      </div>
    </section>
  );
}
