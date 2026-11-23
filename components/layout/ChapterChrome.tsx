"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function ChapterChrome({ header, children }: { header: ReactNode; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let previous = Math.max(0, window.scrollY);
    let delta = 0;
    let hidden = false;
    const mobileViewport = window.matchMedia("(max-width: 767px)");

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = Math.max(0, window.scrollY);
        const step = y - previous;
        previous = y;

        // Accumulate small trackpad movements in the same direction.
        if (step !== 0) delta = Math.sign(step) === Math.sign(delta) ? delta + step : step;
        const revealThreshold = mobileViewport.matches ? -4 : -8;
        const next = y < 80 || delta < revealThreshold ? false : y > 120 && delta > 10 ? true : hidden;
        if (next !== hidden) {
          hidden = next;
          root.dataset.readerChrome = hidden ? "hidden" : "visible";
          delta = 0;
        }
      });
    };

    const revealOnMobileTap = () => {
      if (!hidden || !mobileViewport.matches) return;
      hidden = false;
      delta = 0;
      previous = Math.max(0, window.scrollY);
      root.dataset.readerChrome = "visible";
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("pointerdown", revealOnMobileTap, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root.removeEventListener("pointerdown", revealOnMobileTap);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef} data-reader-chrome="visible" className="group/reader-chrome isolate min-h-screen">
      <a href="#reader-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-white focus:p-3 focus:text-slate-900">
        Đến nội dung chương
      </a>
      <div className="pointer-events-auto sticky top-0 z-50 translate-y-0 transition-transform duration-300 motion-reduce:transition-none group-data-[reader-chrome=hidden]/reader-chrome:pointer-events-none group-data-[reader-chrome=hidden]/reader-chrome:-translate-y-full focus-within:!pointer-events-auto focus-within:!translate-y-0">
        {header}
      </div>
      {children}
    </div>
  );
}
