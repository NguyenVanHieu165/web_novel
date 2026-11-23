"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ChevronLeft, ChevronRight } from "lucide-react";

import HeroStoryCard, { type HeroStoryData } from "./HeroStoryCard";

export interface HeroCarouselProps {
  stories: HeroStoryData[];
  autoPlayInterval?: number;
  onActiveStoryChange?: (story: HeroStoryData) => void;
}

const MAX_SLIDES = 5;
const SWIPE_THRESHOLD = 40;

interface HeroSlideProps {
  story: HeroStoryData;
  index: number;
  offset: number;
  isCenter: boolean;
  isDragging: boolean;
  dragOffsetX: number;
  onSelect: (index: number) => void;
}

function getOffset(index: number, activeIndex: number, total: number) {
  let offset = index - activeIndex;

  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;

  return offset;
}

function getSlideStyle(offset: number, dragOffsetX = 0): CSSProperties {
  const distance = Math.abs(offset);
  const direction = Math.sign(offset);
  const responsiveDistance = `min(${distance === 1 ? "300px" : "400px"}, ${distance === 1 ? "42vw" : "60vw"})`;
  const translateX =
    distance === 0
      ? "0px"
      : direction < 0
        ? `calc(0px - ${responsiveDistance})`
        : responsiveDistance;

  return {
    gridArea: "stack",
    transform: `translateX(${translateX}) translateX(${dragOffsetX}px) scale(${distance === 0 ? 1 : distance === 1 ? 0.9 : 0.8}) rotateY(${-offset * 6}deg)`,
    transformStyle: "preserve-3d",
    zIndex: distance === 0 ? 100 : distance === 1 ? 50 : 10,
  };
}

function HeroSlide({
  story,
  index,
  offset,
  isCenter,
  isDragging,
  dragOffsetX,
  onSelect,
}: HeroSlideProps) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const distance = Math.abs(offset);
  const dimClass =
    distance === 0
      ? "bg-transparent"
      : distance === 1
        ? "bg-black/25"
        : "bg-black/50";

  useGSAP(
    () => {
      const tilt = tiltRef.current;
      const glare = glareRef.current;
      if (!tilt || !glare || !isCenter || isDragging) return;

      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
        () => {
          gsap.set(tilt, { transformPerspective: 1000 });
          const rotateX = gsap.quickTo(tilt, "rotationX", {
            duration: 0.3,
            ease: "power2.out",
          });
          const rotateY = gsap.quickTo(tilt, "rotationY", {
            duration: 0.3,
            ease: "power2.out",
          });
          const glareOpacity = gsap.quickTo(glare, "opacity", {
            duration: 0.2,
            ease: "power2.out",
          });

          const resetTilt = (immediate = false) => {
            if (immediate) {
              gsap.killTweensOf([tilt, glare]);
              gsap.set(tilt, { rotationX: 0, rotationY: 0 });
              gsap.set(glare, { opacity: 0 });
              return;
            }

            rotateX(0);
            rotateY(0);
            glareOpacity(0);
          };

          const isInteractiveTarget = (target: EventTarget | null) =>
            target instanceof Element && target.closest("a, button") !== null;

          const handlePointerMove = (event: PointerEvent) => {
            if (isInteractiveTarget(event.target)) {
              resetTilt(true);
              return;
            }

            const rect = tilt.getBoundingClientRect();
            rotateY(((event.clientX - rect.left) / rect.width - 0.5) * 14);
            rotateX(-((event.clientY - rect.top) / rect.height - 0.5) * 12);
            glareOpacity(0.55);
          };

          const handlePointerOver = (event: PointerEvent) => {
            if (isInteractiveTarget(event.target)) resetTilt(true);
          };
          const handlePointerLeave = () => resetTilt();

          tilt.addEventListener("pointermove", handlePointerMove);
          tilt.addEventListener("pointerover", handlePointerOver);
          tilt.addEventListener("pointerleave", handlePointerLeave);

          return () => {
            tilt.removeEventListener("pointermove", handlePointerMove);
            tilt.removeEventListener("pointerover", handlePointerOver);
            tilt.removeEventListener("pointerleave", handlePointerLeave);
          };
        },
      );

      return () => media.revert();
    },
    {
      scope: tiltRef,
      dependencies: [isCenter, isDragging],
      revertOnUpdate: true,
    },
  );

  return (
    <div
      className={`relative h-[430px] w-[290px] rounded-2xl ease-out will-change-transform motion-reduce:transition-none sm:h-[480px] sm:w-[330px] md:h-[510px] md:w-[350px] ${
        isDragging ? "transition-none" : "transition-transform duration-300"
      }`}
      style={getSlideStyle(offset, dragOffsetX)}
    >
      <div
        ref={tiltRef}
        aria-hidden={!isCenter}
        className={`relative h-full w-full overflow-hidden rounded-2xl border bg-slate-900 transition-colors duration-300 ${
          isCenter ? "border-white/30" : "border-white/10"
        }`}
        style={{
          boxShadow: isCenter
            ? "0 25px 60px -12px rgba(0, 0, 0, 0.85), 0 0 25px rgba(59, 130, 246, 0.25)"
            : "0 12px 30px -6px rgba(0, 0, 0, 0.6)",
          transformStyle: "preserve-3d",
        }}
      >
        <HeroStoryCard
          story={story}
          position={isCenter ? "center" : "hidden"}
          priority={index === 0}
        />

        <div
          ref={glareRef}
          className="pointer-events-none absolute inset-0 z-30 rounded-2xl opacity-0"
          style={{
            background:
              "linear-gradient(125deg, rgba(255,255,255,0.42), rgba(96,165,250,0.16) 45%, transparent 75%)",
          }}
        />

        <div
          className={`pointer-events-none absolute inset-0 z-20 rounded-2xl transition-colors duration-300 ${dimClass}`}
        />
      </div>

      {!isCenter ? (
        <button
          type="button"
          aria-label={`Hiển thị ${story.tenTruyen}`}
          onClick={() => onSelect(index)}
          className="absolute inset-0 z-40 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        />
      ) : null}
    </div>
  );
}

export default function HeroCarousel({
  stories,
  autoPlayInterval = 5,
  onActiveStoryChange,
}: HeroCarouselProps) {
  const carouselStories = useMemo(
    () => stories.slice(0, MAX_SLIDES),
    [stories],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDocumentHidden, setIsDocumentHidden] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const pointerStartXRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerIsDownRef = useRef(false);
  const activeStoryChangeRef = useRef(onActiveStoryChange);
  const total = carouselStories.length;
  const safeActiveIndex = total ? activeIndex % total : 0;

  useEffect(() => {
    activeStoryChangeRef.current = onActiveStoryChange;
  }, [onActiveStoryChange]);

  useEffect(() => {
    const activeStory = carouselStories[safeActiveIndex];
    if (activeStory) activeStoryChangeRef.current?.(activeStory);
  }, [carouselStories, safeActiveIndex]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setPrefersReducedMotion(media.matches);
    const syncVisibility = () => setIsDocumentHidden(document.hidden);

    syncMotionPreference();
    syncVisibility();
    media.addEventListener("change", syncMotionPreference);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      media.removeEventListener("change", syncMotionPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    const releasePointer = () => {
      pointerIsDownRef.current = false;
    };

    window.addEventListener("pointerup", releasePointer, { passive: true });
    window.addEventListener("pointercancel", releasePointer, { passive: true });
    return () => {
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
    };
  }, []);

  const selectSlide = useCallback(
    (index: number) => {
      if (!total) return;
      setActiveIndex(((index % total) + total) % total);
    },
    [total],
  );

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + total) % total);
  }, [total]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % total);
  }, [total]);

  useEffect(() => {
    if (
      total <= 1 ||
      isHovered ||
      isFocused ||
      isDragging ||
      isDocumentHidden ||
      prefersReducedMotion
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!pointerIsDownRef.current) showNext();
    }, Math.max(1, autoPlayInterval) * 1000);

    return () => window.clearInterval(timer);
  }, [
    autoPlayInterval,
    isDocumentHidden,
    isFocused,
    isDragging,
    isHovered,
    prefersReducedMotion,
    showNext,
    total,
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointerIsDownRef.current = true;
    if (!(event.target instanceof Element) || event.target.closest("a, button")) return;

    pointerStartXRef.current = event.clientX;
    activePointerIdRef.current = event.pointerId;
    setDragOffsetX(0);
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      activePointerIdRef.current !== event.pointerId ||
      pointerStartXRef.current === null
    ) {
      return;
    }

    const distance = event.clientX - pointerStartXRef.current;
    setDragOffsetX(Math.max(-120, Math.min(120, distance)));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.isPrimary) pointerIsDownRef.current = false;
    if (
      activePointerIdRef.current !== event.pointerId ||
      pointerStartXRef.current === null
    ) {
      return;
    }

    const distance = event.clientX - pointerStartXRef.current;
    pointerStartXRef.current = null;
    activePointerIdRef.current = null;
    setDragOffsetX(0);
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (Math.abs(distance) < SWIPE_THRESHOLD) return;
    if (distance > 0) showPrevious();
    else showNext();
  };

  if (!total) return null;

  return (
    <section
      aria-label="Truyện nổi bật"
      aria-roledescription="carousel"
      className={`relative grid w-full touch-pan-y select-none place-items-center overflow-hidden py-8 sm:py-10 ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{ gridTemplateAreas: '"stack"', perspective: "1000px" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setIsFocused(false);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerIsDownRef.current = false;
        pointerStartXRef.current = null;
        activePointerIdRef.current = null;
        setDragOffsetX(0);
        setIsDragging(false);
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-3/4 w-3/4 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_68%)]" />
      </div>

      {carouselStories.map((story, index) => {
        const offset = getOffset(index, safeActiveIndex, total);
        const isCenter = offset === 0;

        return (
          <HeroSlide
            key={story.idTruyen}
            story={story}
            index={index}
            offset={offset}
            isCenter={isCenter}
            isDragging={isDragging}
            dragOffsetX={dragOffsetX}
            onSelect={selectSlide}
          />
        );
      })}

      {total > 1 ? (
        <>
          <button
            type="button"
            onClick={showPrevious}
            aria-label="Truyện trước"
            className="absolute left-2 top-1/2 z-[110] flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-xl transition-[transform,background-color,border-color] duration-300 hover:scale-110 hover:border-blue-500/50 hover:bg-blue-600/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95 motion-reduce:transition-none sm:left-6 sm:size-12"
          >
            <ChevronLeft aria-hidden="true" className="size-5 sm:size-6" />
          </button>

          <button
            type="button"
            onClick={showNext}
            aria-label="Truyện tiếp"
            className="absolute right-2 top-1/2 z-[110] flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-xl transition-[transform,background-color,border-color] duration-300 hover:scale-110 hover:border-blue-500/50 hover:bg-blue-600/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95 motion-reduce:transition-none sm:right-6 sm:size-12"
          >
            <ChevronRight aria-hidden="true" className="size-5 sm:size-6" />
          </button>

          <div className="absolute bottom-6 left-1/2 z-[110] flex -translate-x-1/2 gap-2.5">
            {carouselStories.map((story, index) => (
              <button
                key={story.idTruyen}
                type="button"
                onClick={() => selectSlide(index)}
                aria-label={`Đi đến truyện ${index + 1}: ${story.tenTruyen}`}
                aria-current={index === safeActiveIndex ? "true" : undefined}
                className={`h-2 rounded-full transition-[width,background-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 motion-reduce:transition-none ${
                  index === safeActiveIndex
                    ? "w-8 bg-blue-500 shadow-md shadow-blue-500/70"
                    : "w-2 bg-slate-300/60 hover:bg-white"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
