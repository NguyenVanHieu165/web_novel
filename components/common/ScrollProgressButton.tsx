"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export default function ScrollProgressButton() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const [visible, setVisible] = useState(false);

  const radius = 20;
  const circumference = 2 * Math.PI * radius; // ~125.66

  useGSAP(
    () => {
      if (!btnRef.current || !circleRef.current) return;

      // Initialize stroke offset
      gsap.set(circleRef.current, {
        strokeDasharray: circumference,
        strokeDashoffset: circumference,
      });

      // Track window scroll progress
      const st = ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          const progress = self.progress;
          const offset = circumference - progress * circumference;

          if (circleRef.current) {
            gsap.to(circleRef.current, {
              strokeDashoffset: offset,
              duration: 0.1,
              overwrite: "auto",
            });
          }

          // Toggle visibility when scrolled past 350px
          if (self.scroll() > 350) {
            if (!visible) setVisible(true);
            gsap.to(btnRef.current, {
              autoAlpha: 1,
              scale: 1,
              duration: 0.3,
              overwrite: "auto",
            });
          } else {
            if (visible) setVisible(false);
            gsap.to(btnRef.current, {
              autoAlpha: 0,
              scale: 0.8,
              duration: 0.3,
              overwrite: "auto",
            });
          }
        },
      });

      return () => st.kill();
    },
    { dependencies: [visible], scope: btnRef }
  );

  const scrollToTop = () => {
    gsap.to(window, {
      duration: 1.1,
      scrollTo: { y: 0, autoKill: false },
      ease: "power3.inOut",
    });
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={scrollToTop}
      aria-label="Cuộn lên đầu trang"
      className="fixed bottom-7 right-7 z-50 w-12 h-12 rounded-full bg-slate-900/90 dark:bg-zinc-900/95 backdrop-blur-md border border-white/15 shadow-2xl flex items-center justify-center text-white hover:text-blue-400 hover:scale-110 active:scale-95 transition-all opacity-0 pointer-events-auto cursor-pointer group"
    >
      {/* SVG Circular Progress Bar */}
      <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none p-0.5">
        <circle
          cx="24"
          cy="24"
          r={radius}
          className="stroke-white/10 fill-none"
          strokeWidth="2.5"
        />
        <circle
          ref={circleRef}
          cx="24"
          cy="24"
          r={radius}
          className="stroke-blue-500 fill-none transition-[stroke-dashoffset] duration-75 ease-linear"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Up Arrow Icon */}
      <ArrowUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform duration-200 text-slate-300 group-hover:text-blue-400" />
    </button>
  );
}
