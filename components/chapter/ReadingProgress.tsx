"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { progressResponseSchema } from "@/lib/reading-progress";
import {
  classifyReaderScroll, createProgressSaveQueue, measureReadingProgress, progressScope,
  readLocalProgress, resumeScrollPosition, selectResumeProgress, writeLocalProgress,
  type ProgressPoint,
} from "@/lib/reader-progress-state";

interface ReaderLeavingDetail { chapterId?: number; waitUntil?: (promise: Promise<void>) => void }
interface ProgressActions { resume: (point: ProgressPoint) => void; restart: () => void; retry: () => void }

export default function ReadingProgress({ chapterId }: { chapterId: number }) {
  const { user } = useAuth();
  return <ChapterProgress key={`${chapterId}:${user?.idTaiKhoan ?? "guest"}`} chapterId={chapterId} accountId={user?.idTaiKhoan} />;
}

function ChapterProgress({ chapterId, accountId }: { chapterId: number; accountId?: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<ProgressActions | null>(null);
  const [resume, setResume] = useState<ProgressPoint | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const content = document.getElementById("reader-content");
    if (!content) return;
    const controller = new AbortController();
    const scope = progressScope(accountId);
    const storage = {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    };
    let active = true;
    let frame = 0;
    let resumeFrame = 0;
    let userScrollPending = false;
    let lastIntent = -Infinity;
    let ignoreScrollUntil = 0;
    let interacted = false;
    let local = readLocalProgress(storage, scope, chapterId);
    let serverLoaded = accountId === undefined;
    let current: ProgressPoint = { position: 0, percent: 0 };

    const measure = () => {
      const rect = content.getBoundingClientRect();
      current = measureReadingProgress({
        scrollY: window.scrollY, contentTop: rect.top + window.scrollY,
        contentHeight: content.scrollHeight, viewportHeight: window.innerHeight,
      });
      if (barRef.current) barRef.current.style.transform = `scaleX(${current.percent / 100})`;
      return current;
    };
    const persist = (point: ProgressPoint, pending: boolean) => {
      local = { ...point, scope, chapterId, pending, updatedAt: Date.now() };
      writeLocalProgress(storage, local);
    };
    const queue = createProgressSaveQueue({
      persist,
      save: async (point, keepalive) => {
        if (!accountId) return;
        const response = await fetch(`/api/chapters/${chapterId}/progress`, {
          method: "PUT", headers: { "Content-Type": "application/json", "X-Reader-Account": String(accountId) },
          body: JSON.stringify(point), keepalive,
        });
        if (!response.ok) throw new Error("Chưa thể đồng bộ tiến độ. Hệ thống sẽ thử lại khi bạn tiếp tục đọc.");
        progressResponseSchema.parse(await response.json());
      },
      onSaved: () => { if (active) setError(""); },
      onError: (err) => { if (active) setError(err instanceof Error ? err.message : "Chưa thể đồng bộ tiến độ."); },
    });
    const record = (point: ProgressPoint) => {
      interacted = true;
      queue.enqueue(point);
      if (!accountId) void queue.flush();
    };
    const captureUserScroll = () => {
      if (!userScrollPending) return;
      userScrollPending = false;
      // Next can reset window scroll in a layout effect before this passive cleanup.
      // A detached outgoing article must never replace its last connected position.
      if (!content.isConnected) return;
      record(measure());
    };
    const flush = (keepalive = false) => {
      captureUserScroll();
      return queue.flush(keepalive);
    };
    const onIntent = () => { lastIntent = performance.now(); };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey ||
        (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, button, a, [role='dialog']")))) return;
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) onIntent();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.clientX >= document.documentElement.clientWidth - 20) onIntent();
    };
    const onScroll = () => {
      const intent = classifyReaderScroll(lastIntent, performance.now(), ignoreScrollUntil);
      lastIntent = intent.lastIntent;
      if (intent.userDriven) userScrollPending = true;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const onResize = () => { ignoreScrollUntil = performance.now() + 200; measure(); };
    const onLayoutChange = () => {
      captureUserScroll();
      lastIntent = -Infinity;
      ignoreScrollUntil = performance.now() + 300;
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") void flush(true); };
    const onPageHide = () => { void flush(true); };
    const prepareDeparture = () => {
      const promise = flush(true);
      lastIntent = -Infinity;
      userScrollPending = false;
      ignoreScrollUntil = performance.now() + 1500;
      return promise;
    };
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<ReaderLeavingDetail>).detail;
      if (detail?.chapterId !== undefined && detail.chapterId !== chapterId) return;
      const promise = prepareDeparture();
      detail?.waitUntil?.(promise);
    };
    const onLinkClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin && link.pathname !== window.location.pathname) void prepareDeparture();
    };
    const loadServerProgress = async () => {
      if (!accountId) {
        if (local && local.percent > 0 && !interacted) setResume(local);
        return;
      }
      try {
        const response = await fetch(`/api/chapters/${chapterId}/progress`, {
          signal: controller.signal, cache: "no-store", headers: { "X-Reader-Account": String(accountId) },
        });
        if (!response.ok) throw new Error("Không thể tải tiến độ từ tài khoản. Bạn vẫn có thể tiếp tục đọc và thử lại.");
        const { data } = progressResponseSchema.parse(await response.json());
        if (!active) return;
        serverLoaded = true;
        const candidate = selectResumeProgress(data, local);
        if (!interacted && candidate && candidate.percent > 0) setResume(candidate);
        if (!interacted && candidate && "pending" in candidate && candidate.pending && local) queue.enqueue(local);
        if (!interacted && candidate && !candidate.pending && data.updatedAt !== null) {
          local = { position: candidate.position, percent: candidate.percent, scope, chapterId, pending: false, updatedAt: Date.parse(data.updatedAt) };
          writeLocalProgress(storage, local);
        }
        if (data.updatedAt === null && !candidate && !interacted) record(measure());
        await flush();
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        if (local && !interacted && local.percent > 0) setResume(local);
        if (local?.pending && !interacted) queue.enqueue(local);
        setError(err instanceof Error ? err.message : "Không thể tải tiến độ.");
        // A failed GET must not disable saves of new user activity.
        if (queue.hasPending()) void queue.flush();
      }
    };
    actionsRef.current = {
      resume: (point) => {
        setResume(null);
        window.cancelAnimationFrame(resumeFrame);
        resumeFrame = window.requestAnimationFrame(() => {
          const rect = content.getBoundingClientRect();
          window.scrollTo({
            top: resumeScrollPosition({ percent: point.percent, contentTop: rect.top + window.scrollY, contentHeight: content.scrollHeight, viewportHeight: window.innerHeight }),
            behavior: "instant",
          });
          ignoreScrollUntil = performance.now() + 200;
          record(measure());
          void flush();
        });
      },
      restart: () => {
        setResume(null);
        window.cancelAnimationFrame(resumeFrame);
        resumeFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: Math.max(0, content.getBoundingClientRect().top + window.scrollY - 56), behavior: "instant" });
          ignoreScrollUntil = performance.now() + 200;
          measure();
        });
        record({ position: 0, percent: 0 });
        void flush();
      },
      retry: () => { if (serverLoaded || queue.hasPending()) void flush(); else void loadServerProgress(); },
    };
    measure();
    void loadServerProgress();
    const interval = window.setInterval(() => { void flush(); }, 5000);
    const localInterval = window.setInterval(captureUserScroll, 250);
    const observer = new ResizeObserver(onResize);
    observer.observe(content);
    window.addEventListener("wheel", onIntent, { passive: true });
    window.addEventListener("touchmove", onIntent, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("popstate", onNavigate);
    window.addEventListener("reader-leaving", onNavigate);
    window.addEventListener("reader-layout", onLayoutChange);
    document.addEventListener("click", onLinkClick, { capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      // Persist locally before closing. Never send a follow-up with a new auth cookie.
      captureUserScroll();
      active = false;
      queue.close();
      controller.abort();
      actionsRef.current = null;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(resumeFrame);
      window.clearInterval(interval);
      window.clearInterval(localInterval);
      observer.disconnect();
      window.removeEventListener("wheel", onIntent);
      window.removeEventListener("touchmove", onIntent);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("popstate", onNavigate);
      window.removeEventListener("reader-leaving", onNavigate);
      window.removeEventListener("reader-layout", onLayoutChange);
      document.removeEventListener("click", onLinkClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [chapterId, accountId]);

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-blue-100/30">
        <div ref={barRef} className="h-full origin-left bg-blue-500" style={{ transform: "scaleX(0)" }} />
      </div>
      {resume && <aside className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-400/30 bg-blue-500/5 p-3 text-sm">
        <span>Lần trước bạn đã đọc {Math.round(resume.percent)}% chương này.</span>
        <div className="flex gap-3">
          <button type="button" onClick={() => actionsRef.current?.resume(resume)} style={{ color: "var(--reader-accent, currentColor)" }} className="rounded-md px-2 py-1 font-semibold focus-visible:outline-none focus-visible:ring-2">Đọc tiếp</button>
          <button type="button" onClick={() => actionsRef.current?.restart()} className="rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2">Đọc từ đầu</button>
        </div>
      </aside>}
      {error && <div className="mb-3 flex items-center gap-3 text-xs">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        <p role="status">{error}</p>
        <button type="button" onClick={() => actionsRef.current?.retry()} className="shrink-0 rounded border px-2 py-1 focus-visible:ring-2">Thử lại</button>
      </div>}
    </>
  );
}
