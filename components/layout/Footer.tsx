"use client";

import { useRef } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Mail, MessageCircle } from "lucide-react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { Button } from "@/components/ui/button";

const EXPLORE_LINKS = [
  { label: "Truyện mới", href: "/truyen-moi" },
  { label: "Truyện Full", href: "/truyen-full" },
  { label: "Xếp hạng", href: "/xep-hang" },
  { label: "Thể loại", href: "/the-loai" },
];

const SUPPORT_LINKS = [
  { label: "Liên hệ:Nguyễn Văn Hiếu", href: "tel:0774423506" },
  { label: "FAQ", href: "/faq" },
  { label: "Điều khoản", href: "/dieu-khoan" },
  { label: "Chính sách bảo mật", href: "/chinh-sach" },
];

const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/nguyen.hieu.525853/",
    icon: ExternalLink,
    color: "hover:text-blue-400 hover:border-blue-500/50",
  },
  {
    label: "Discord",
    href: "#",
    icon: MessageCircle,
    color: "hover:text-indigo-400 hover:border-indigo-500/50",
  },
  {
    label: "Email",
    href: "mailto:nhieu1652004@gmail.com",
    icon: Mail,
    color: "hover:text-emerald-400 hover:border-emerald-500/50",
  },
];

export default function Footer() {
  const footerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const cols = gsap.utils.toArray<HTMLElement>(".footer-col");
      if (cols.length === 0) return;

      gsap.from(cols, {
        scrollTrigger: {
          trigger: footerRef.current,
          start: "top 92%",
          toggleActions: "play none none none",
        },
        y: 35,
        opacity: 0,
        stagger: 0.12,
        duration: 0.7,
        ease: "power3.out",
      });
    },
    { scope: footerRef },
  );

  return (
    <footer
      ref={footerRef}
      className="relative w-full bg-slate-900 dark:bg-zinc-950 text-slate-300 border-t border-slate-800/80 overflow-hidden"
    >
      {/* Decorative ambient background light */}
      <div className="absolute top-0 left-1/4 w-96 h-32 bg-blue-600/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-1/4 w-96 h-32 bg-indigo-600/10 blur-[100px] pointer-events-none rounded-full" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Col 1: Brand */}
          <div className="footer-col space-y-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                <BookOpen className="w-5 h-5 text-white" strokeWidth={2.2} />
              </div>
              <span className="font-extrabold text-lg tracking-tight text-white select-none">
                WEB<span className="text-blue-400">NOVEL</span>
              </span>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
              Đọc truyện online chất lượng cao. Khám phá những câu chuyện hay
              nhất từ hàng nghìn tác giả Việt Nam và thế giới.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-3 pt-1">
              {SOCIAL_LINKS.map((s) => (
                <Button key={s.label} asChild variant="ghost" size="icon-sm" className={`rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 ${s.color}`}>
                  <a href={s.href} aria-label={s.label}><s.icon aria-hidden="true" /></a>
                </Button>
              ))}
            </div>
          </div>

          {/* Col 2: Khám phá */}
          <div className="footer-col">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-5">
              Khám phá
            </h4>
            <ul className="space-y-3">
              {EXPLORE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-150 inline-block hover:translate-x-1 transition-transform"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Hỗ trợ */}
          <div className="footer-col">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-5">
              Hỗ trợ
            </h4>
            <ul className="space-y-3">
              {SUPPORT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-150 inline-block hover:translate-x-1 transition-transform"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Theo dõi */}
          <div className="footer-col">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-5">
              Theo dõi
            </h4>
            <ul className="space-y-3">
              {SOCIAL_LINKS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className={`group flex items-center gap-2 text-sm text-slate-400 ${s.color} transition-colors duration-150`}
                  >
                    <s.icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} WEBNOVEL. Mọi quyền được bảo lưu.</p>
          <p>
            Nền tảng đọc truyện chữ trực tuyến &mdash; Dành cho độc giả Việt Nam
          </p>
        </div>
      </div>
    </footer>
  );
}
