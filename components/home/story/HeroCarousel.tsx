"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { useGSAP } from "@gsap/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import HeroStoryCard, { HeroStoryData } from "./HeroStoryCard";

if (typeof window !== "undefined") {
  gsap.registerPlugin(Draggable);
}

export interface HeroCarouselProps {
  stories: HeroStoryData[];
  autoPlayInterval?: number; // Thời gian chuyển slide (giây)
  onActiveStoryChange?: (story: HeroStoryData) => void;
}

interface CardTiltTweens {
  rotateX: ReturnType<typeof gsap.quickTo>;
  rotateY: ReturnType<typeof gsap.quickTo>;
  glareOpacity: ReturnType<typeof gsap.quickTo>;
}

export default function Ultimate3DCoverFlow({
  stories,
  autoPlayInterval = 5,
  onActiveStoryChange,
}: HeroCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragProxyRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const glareRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);

  const progressRef = useRef(0);
  const snapTweenRef = useRef<gsap.core.Tween | null>(null);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDraggingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const isHoveredRef = useRef(false);
  const isFocusedRef = useRef(false);
  const tiltTweensRef = useRef(new Map<number, CardTiltTweens>());
  const activeStoryChangeRef = useRef(onActiveStoryChange);

  useEffect(() => {
    activeStoryChangeRef.current = onActiveStoryChange;
  }, [onActiveStoryChange]);

  const total = stories.length;

  /*
   * 1. HÀM TÍNH TOÁN VÀ CẬP NHẬT GIAO DIỆN 3D DỰA TRÊN PROGRESS
   */
  const updateCardTransforms = useCallback(() => {
    if (!total) return;

    const currentProg = progressRef.current;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;

      // Khoảng cách tương đối từ card hiện tại tới tâm (có wrap-around vô tận)
      let offset = index - currentProg;
      offset =
        (((((offset % total) + total) % total) + total / 2) % total) -
        total / 2;

      const absOffset = Math.abs(offset);

      // Card ở xa quá 2.5 đơn vị sẽ được ẩn hoàn toàn để tối ưu render
      if (absOffset > 2.5) {
        gsap.set(card, { opacity: 0, pointerEvents: "none", zIndex: 0 });
        return;
      }

      // Nội suy giá trị chuyển động mượt mà
      const xPercent = offset * 68; // Độ dịch ngang
      const z =
        -Math.pow(absOffset, 1.2) * 90 +
        (absOffset < 0.5 ? (1 - absOffset * 2) * 110 : 0);
      const rotateY = -offset * 18; // Góc xoay cung tròn
      const scale = Math.max(0.72, 1.15 - absOffset * 0.22);
      const opacity = Math.max(0, 1 - Math.pow(absOffset / 2.3, 2));
      const brightness = Math.max(35, 105 - absOffset * 32);
      const zIndex = Math.round(50 - absOffset * 10);

      gsap.set(card, {
        xPercent,
        z,
        rotateY,
        scale,
        opacity,
        zIndex,
        filter: `brightness(${brightness}%)`,
        pointerEvents: absOffset < 0.5 ? "auto" : "none",
        visibility: "visible",
      });
    });

    // Cập nhật indicator dots
    let active = Math.round(currentProg) % total;
    if (active < 0) active += total;
    setActiveIndex(active);
  }, [total]);

  /*
   * 2. TỰ ĐỘNG HÍT VÀO VỊ TRÍ GẦN NHẤT (SNAP)
   */
  const snapTo = useCallback(
    (targetIndex: number, duration = 0.65) => {
      if (snapTweenRef.current) snapTweenRef.current.kill();

      if (total > 0) {
        const normalizedIndex = ((targetIndex % total) + total) % total;
        setActiveIndex(normalizedIndex);
        if (stories[normalizedIndex]) {
          activeStoryChangeRef.current?.(stories[normalizedIndex]);
        }
      }

      snapTweenRef.current = gsap.to(progressRef, {
        current: targetIndex,
        duration: reducedMotionRef.current ? 0 : duration,
        ease: "power3.out",
        onUpdate: updateCardTransforms,
      });
    },
    [updateCardTransforms, total, stories],
  );

  /*
   * 3. AUTO-PLAY TIMER
   */
  const stopAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  }, []);

  const startAutoPlay = useCallback(() => {
    stopAutoPlay();
    if (total <= 1 || reducedMotionRef.current || document.hidden || isHoveredRef.current || isFocusedRef.current) return;

    autoPlayTimerRef.current = setInterval(() => {
      if (!isDraggingRef.current) {
        const nextIndex = Math.round(progressRef.current) + 1;
        snapTo(nextIndex);
      }
    }, Math.max(1, autoPlayInterval) * 1000);
  }, [total, autoPlayInterval, snapTo, stopAutoPlay]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncAutoPlay = () => {
      reducedMotionRef.current = media.matches;
      if (media.matches || document.hidden) {
        stopAutoPlay();
        snapTweenRef.current?.kill();
        progressRef.current = Math.round(progressRef.current);
        updateCardTransforms();
      } else startAutoPlay();
    };
    reducedMotionRef.current = media.matches;
    startAutoPlay();
    media.addEventListener("change", syncAutoPlay);
    document.addEventListener("visibilitychange", syncAutoPlay);
    return () => {
      stopAutoPlay();
      media.removeEventListener("change", syncAutoPlay);
      document.removeEventListener("visibilitychange", syncAutoPlay);
    };
  }, [startAutoPlay, stopAutoPlay, updateCardTransforms]);

  useEffect(() => {
    const tiltTweens = tiltTweensRef.current;
    return () => {
      snapTweenRef.current?.kill();
      tiltTweens.forEach(({ rotateX, rotateY, glareOpacity }) => {
        rotateX.tween.kill();
        rotateY.tween.kill();
        glareOpacity.tween.kill();
      });
      tiltTweens.clear();
    };
  }, []);

  /*
   * 4. GSAP DRAGGABLE TÍCH HỢP CON TRỎ VÀ CHẠM CẢM ỨNG
   */
  useGSAP(
    () => {
      updateCardTransforms();
      if (!dragProxyRef.current || total <= 1) return;

      let startProgress = 0;

      const draggables = Draggable.create(dragProxyRef.current, {
        type: "x",
        trigger: containerRef.current,
        cursor: "grab",
        activeCursor: "grabbing",
        onPress() {
          stopAutoPlay();
          if (snapTweenRef.current) snapTweenRef.current.kill();
          isDraggingRef.current = true;
          startProgress = progressRef.current;
        },
        onDrag() {
          // Tỉ lệ kéo pixel đổi thành đơn vị di chuyển card
          const dragSensitivity = 0.003;
          const delta = (this.x - this.startX) * dragSensitivity;
          progressRef.current = startProgress - delta;
          updateCardTransforms();
        },
        onDragEnd() {
          isDraggingRef.current = false;
          // Tìm index nguyên gần nhất để snap
          const nearestIndex = Math.round(progressRef.current);
          snapTo(nearestIndex);
          startAutoPlay();
        },
      });

      const tiltTweens = tiltTweensRef.current;
      return () => {
        draggables.forEach((draggable) => draggable.kill());
        snapTweenRef.current?.kill();
        tiltTweens.forEach(({ rotateX, rotateY, glareOpacity }) => {
          rotateX.tween.kill();
          rotateY.tween.kill();
          glareOpacity.tween.kill();
        });
        tiltTweens.clear();
        isDraggingRef.current = false;
      };
    },
    {
      scope: containerRef,
      dependencies: [total, updateCardTransforms, snapTo, startAutoPlay],
      revertOnUpdate: true,
    },
  );

  /*
   * 5. HIỆU ỨNG TILT 3D & ÁNH SÁNG PHẢN QUANG (GLARE) KHI RÊ CHUỘT
   */
  const handleMouseMove = (
    e: React.MouseEvent<HTMLDivElement>,
    index: number,
  ) => {
    const card = cardRefs.current[index];
    const glare = glareRefs.current[index];
    if (!card || !glare || isDraggingRef.current || reducedMotionRef.current) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const tiltX = -((y - centerY) / centerY) * 12;
    const tiltY = ((x - centerX) / centerX) * 14;

    let tilt = tiltTweensRef.current.get(index);
    if (!tilt) {
      glare.style.background = "radial-gradient(circle at center, rgba(255,255,255,0.4) 0%, transparent 65%)";
      tilt = {
        rotateX: gsap.quickTo(card, "rotationX", { duration: 0.25, ease: "power1.out" }),
        rotateY: gsap.quickTo(card, "rotationY", { duration: 0.25, ease: "power1.out" }),
        glareOpacity: gsap.quickTo(glare, "opacity", { duration: 0.2, ease: "power1.out" }),
      };
      tiltTweensRef.current.set(index, tilt);
    }
    tilt.rotateX(tiltX);
    tilt.rotateY(tiltY);
    tilt.glareOpacity(0.55);
  };

  const handleMouseLeave = (index: number) => {
    const card = cardRefs.current[index];
    const glare = glareRefs.current[index];
    if (!card || !glare) return;

    const tilt = tiltTweensRef.current.get(index);
    tilt?.rotateX(0);
    tilt?.rotateY(0);
    tilt?.glareOpacity(0);
  };

  const next = () => {
    stopAutoPlay();
    snapTo(Math.round(progressRef.current) + 1);
    startAutoPlay();
  };

  const prev = () => {
    stopAutoPlay();
    snapTo(Math.round(progressRef.current) - 1);
    startAutoPlay();
  };

  const goTo = (index: number) => {
    stopAutoPlay();
    const current = Math.round(progressRef.current);
    let diff = (index - (current % total) + total) % total;
    if (diff > total / 2) diff -= total;
    snapTo(current + diff);
    startAutoPlay();
  };

  if (!total) return null;

  return (
    <section
      className="relative w-full select-none overflow-hidden py-14"
      onMouseEnter={() => { isHoveredRef.current = true; stopAutoPlay(); }}
      onMouseLeave={() => { isHoveredRef.current = false; startAutoPlay(); }}
      onFocusCapture={() => { isFocusedRef.current = true; stopAutoPlay(); }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          isFocusedRef.current = false;
          startAutoPlay();
        }
      }}
    >
      {/* Proxy element ẩn dùng để GSAP Draggable bắt sự kiện kéo mượt mà */}
      <div
        ref={dragProxyRef}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Ánh sáng nền Volumetric */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[340px] w-[600px] rounded-full bg-blue-600/15 blur-[130px]" />
      </div>

      {/* 3D Stage Container */}
      <div
        ref={containerRef}
        className="relative flex h-[440px] w-full items-center justify-center sm:h-[490px] md:h-[550px]"
        style={{
          perspective: "1400px",
          transformStyle: "preserve-3d",
        }}
      >
        {stories.map((story, index) => {
          const isCenter = index === activeIndex;

          return (
            <div
              key={story.idTruyen}
              ref={(el) => {
                cardRefs.current[index] = el;
              }}
              onMouseMove={(e) =>
                isCenter ? handleMouseMove(e, index) : undefined
              }
              onMouseLeave={() =>
                isCenter ? handleMouseLeave(index) : undefined
              }
              onClick={() => {
                if (!isCenter) goTo(index);
              }}
              className="absolute top-1/2 -translate-y-1/2 cursor-pointer will-change-[transform,opacity,filter] rounded-2xl"
              style={{
                transformStyle: "preserve-3d",
                borderRadius: "1rem",
                boxShadow: isCenter
                  ? "0 25px 60px -12px rgba(0, 0, 0, 0.85), 0 0 25px rgba(59, 130, 246, 0.25)"
                  : "0 12px 30px -6px rgba(0, 0, 0, 0.6)",
                WebkitBoxReflect:
                  "below 12px linear-gradient(to bottom, transparent 65%, rgba(0, 0, 0, 0.25))",
              }}
            >
              {/* Thẻ bọc có viền sáng viền kính */}
              <div
                className={`relative overflow-hidden rounded-2xl border transition-colors duration-500 bg-slate-900 ${
                  isCenter ? "border-white/30" : "border-white/10"
                }`}
                style={{
                  borderRadius: "1rem",
                  WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                }}
              >
                <HeroStoryCard
                  story={story}
                  position={isCenter ? "center" : "hidden"}
                  eager={index < 5}
                />

                {/* Vệt phản quang Holo Glare */}
                <div
                  ref={(el) => {
                    glareRefs.current[index] = el;
                  }}
                  className="pointer-events-none absolute inset-0 z-30 opacity-0 transition-opacity rounded-2xl"
                  style={{ borderRadius: "1rem" }}
                />
              </div>
            </div>
          );
        })}

        {/* Nút Previous */}
        {total > 1 && (
          <button
            type="button"
            onClick={prev}
            aria-label="Truyện trước"
            className="absolute left-4 top-1/2 z-50 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-xl transition-all duration-300 hover:scale-110 hover:border-blue-500/50 hover:bg-blue-600/80 active:scale-95 sm:left-8"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Nút Next */}
        {total > 1 && (
          <button
            type="button"
            onClick={next}
            aria-label="Truyện tiếp"
            className="absolute right-4 top-1/2 z-50 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-xl transition-all duration-300 hover:scale-110 hover:border-blue-500/50 hover:bg-blue-600/80 active:scale-95 sm:right-8"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Dots Indicator */}
      {total > 1 && (
        <div className="mt-8 flex justify-center gap-2.5">
          {stories.map((story, index) => (
            <button
              key={story.idTruyen}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Trang ${index + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? "w-8 bg-blue-500 shadow-md shadow-blue-500/70"
                  : "w-2 bg-slate-500/40 hover:bg-slate-300"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
