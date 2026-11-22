"use client";

import { useRef } from "react";
import SectionHeader from "@/components/common/SectionHeader";
import BlogCard from "@/components/blog/BlogCard";
import { gsap, useGSAP } from "@/lib/gsap";

const MOCK_BLOGS = [
  {
    id: 1,
    thumbnail:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop&q=60",
    category: "REVIEW",
    title: "Top 10 truyện Tiên Hiệp hay nhất 2026 – Không thể bỏ qua",
    description:
      "Danh sách những bộ truyện tiên hiệp xuất sắc nhất được độc giả bình chọn nhiều nhất, đồ sộ từ cốt truyện đến thế giới tu chân...",
    date: "15/09/2026",
    href: "/blog/top-10-tien-hiep-2026",
  },
  {
    id: 2,
    thumbnail:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=60",
    category: "TOP LIST",
    title: "5 truyện ngôn tình ngọt ngào nhất tháng 9 – Đọc một lần là nghiện",
    description:
      "Những tác phẩm ngôn tình lãng mạn, câu chuyện tình yêu đẹp không thể rời mắt với những khúc quanh cảm xúc bất ngờ...",
    date: "10/09/2026",
    href: "/blog/ngon-tinh-thang-9",
  },
  {
    id: 3,
    thumbnail:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&auto=format&fit=crop&q=60",
    category: "BÌNH LUẬN",
    title: "Phân tích: Đấu Phá Thương Khung – Tại sao vẫn giữ vững vị thế huyền thoại?",
    description:
      "Đánh giá toàn diện về sức hút trường tồn của bộ truyện, hành trình của Tiêu Viêm và triết lý trưởng thành sâu sắc...",
    date: "05/09/2026",
    href: "/blog/review-dau-pha-thuong-khung",
  },
];

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
        {MOCK_BLOGS.map((blog) => (
          <BlogCard
            key={blog.id}
            thumbnail={blog.thumbnail}
            category={blog.category}
            title={blog.title}
            description={blog.description}
            date={blog.date}
            href={blog.href}
          />
        ))}
      </div>
    </section>
  );
}
