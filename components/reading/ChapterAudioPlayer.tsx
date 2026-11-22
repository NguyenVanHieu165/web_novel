"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Headphones, Loader2, Pause, Play, RotateCcw, RotateCw, Square, X } from "lucide-react";
import { z } from "zod";
import type { ChapterDetailData, NavChapterItem } from "@/lib/mappers/chapter.mapper";
import { getChapterPath } from "@/lib/reader-navigation";
import { audioResponseSchema, playbackRates, storyVoices, voiceSchema } from "@/lib/tts/voices";
import { continueAudioAt, hasAudioContinuation } from "@/lib/tts/audio-continuation";
import { useAudioPreferences } from "@/hooks/useAudioPreferences";
import { useBrowserNarration } from "@/hooks/useBrowserNarration";
import { useReaderNavigation } from "@/components/chapter/ReaderNavigationProvider";

const buttonClass = "grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--reader-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--reader-accent)] disabled:opacity-35";
const selectClass = "min-h-11 w-full rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] px-2 text-[var(--reader-text)] focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)]";
const mediaErrors = z.object({ message: z.string().optional() });
function clock(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

export default function ChapterAudioPlayer({ data, onClose }: { data: ChapterDetailData; onClose: () => void }) {
  const { chapter, story, prevChapter, nextChapter } = data;
  const { navigate } = useReaderNavigation();
  const { preferences, updatePreferences } = useAudioPreferences();
  const audioRef = useRef<HTMLAudioElement>(null);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "fallback" | "error">("idle");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(false);
  const narration = useBrowserNarration({ voice: preferences.voice, rate: preferences.rate, onEnded: () => {
    if (preferences.autoNext && nextChapter) goToChapter(nextChapter);
  } });

  function goToChapter(destination: NavChapterItem) {
    const path = getChapterPath(story.slug, destination.slug);
    continueAudioAt(path);
    navigate(path);
  }
  const stop = () => {
    requestId.current++;
    controller.current?.abort();
    narration.stop();
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPlaying(false);
    setTime(0);
    if (status === "loading" || status === "fallback") setStatus("idle");
  };
  const playNative = async () => {
    try { await audioRef.current?.play(); setError(""); }
    catch (failure) {
      setPlaying(false);
      setError(failure instanceof DOMException && failure.name === "NotAllowedError"
        ? "Chạm Phát để cho phép trình duyệt phát audio."
        : "Chưa thể phát audio. Hãy nhấn Phát để thử lại.");
    }
  };
  const loadAndPlay = async () => {
    if (status === "loading") return;
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/chapters/" + chapter.idChuong + "/audio?voice=" + preferences.voice, {
        signal: abort.signal, cache: "no-store",
      });
      if (id !== requestId.current) return;
      if (!response.ok) {
        const body = mediaErrors.safeParse(await response.json().catch(() => null));
        const message = body.success ? body.data.message : undefined;
        if (response.status < 500) {
          setStatus("error");
          setError(message ?? "Không thể tải audio chương này.");
          return; // Paywall/auth failures must never trigger browser narration.
        }
        throw new Error(message ?? "Máy chủ chưa thể tạo audio.");
      }
      const result = audioResponseSchema.parse(await response.json());
      if (id !== requestId.current || !audioRef.current) return;
      narration.stop();
      audioRef.current.src = result.audioUrl;
      audioRef.current.playbackRate = preferences.rate;
      audioRef.current.load();
      setCached(result.cached);
      setStatus("ready");
      await playNative();
    } catch (failure) {
      if (abort.signal.aborted || id !== requestId.current) return;
      setError(failure instanceof Error ? failure.message : "Mất kết nối tới máy chủ audio.");
      setStatus(narration.start() ? "fallback" : "error");
    }
  };
  const play = () => {
    if (status === "fallback") {
      if (narration.state === "playing") narration.pause();
      else if (narration.state === "paused") narration.resume();
      else narration.start();
    } else if (status === "ready") {
      if (playing) audioRef.current?.pause();
      else void playNative();
    } else void loadAndPlay();
  };
  const seek = (position: number) => {
    const audio = audioRef.current;
    if (!audio || status !== "ready" || !Number.isFinite(audio.duration)) return;
    const next = Math.min(Math.max(0, position), audio.duration);
    audio.currentTime = next;
    setTime(next);
  };

  const playEvent = useEffectEvent(() => {
    if (status === "fallback") {
      if (narration.state === "paused") narration.resume();
      else if (narration.state === "idle") narration.start();
    }
    else if (!playing) { if (status === "ready") void playNative(); else void loadAndPlay(); }
  });
  const pauseEvent = useEffectEvent(() => { audioRef.current?.pause(); if (narration.state === "playing") narration.pause(); });
  const seekEvent = useEffectEvent((offset: number) => seek((audioRef.current?.currentTime ?? 0) + offset));
  const seekToEvent = useEffectEvent((position: number) => seek(position));
  const previousEvent = useEffectEvent(() => { if (prevChapter) goToChapter(prevChapter); });
  const nextEvent = useEffectEvent(() => { if (nextChapter) goToChapter(nextChapter); });
  const stopEvent = useEffectEvent(stop);
  const startEvent = useEffectEvent(() => { void loadAndPlay(); });

  useEffect(() => {
    const audio = audioRef.current;
    const abortRef = controller;
    const sequenceRef = requestId;
    let active = true;
    const leave = () => { sequenceRef.current++; abortRef.current?.abort(); audio?.pause(); };
    window.addEventListener("reader-leaving", leave);
    window.addEventListener("pagehide", leave);
    queueMicrotask(() => {
      if (active && hasAudioContinuation(getChapterPath(story.slug, chapter.slug), true)) startEvent();
    });
    return () => {
      leave();
      active = false;
      if (audio) { audio.removeAttribute("src"); audio.load(); }
      window.removeEventListener("reader-leaving", leave);
      window.removeEventListener("pagehide", leave);
    };
  }, [story.slug, chapter.slug]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = preferences.rate; }, [preferences.rate]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const media = navigator.mediaSession;
    if ("MediaMetadata" in window) {
      const artwork: MediaImage[] = [];
      if (story.anhBia) {
        try {
          const url = new URL(story.anhBia, window.location.origin);
          if (url.protocol === "https:" || url.protocol === "http:") artwork.push({ src: url.href });
        } catch { /* A malformed cover must not interrupt audio playback. */ }
      }
      media.metadata = new MediaMetadata({ title: chapter.tieuDeChuong, artist: story.tenTruyen, album: story.tenTruyen, artwork });
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => playEvent()], ["pause", () => pauseEvent()], ["stop", () => stopEvent()],
      ["seekbackward", (details) => seekEvent(-(details.seekOffset ?? 15))],
      ["seekforward", (details) => seekEvent(details.seekOffset ?? 15)],
      ["seekto", (details) => { if (details.seekTime !== undefined) seekToEvent(details.seekTime); }],
      ["previoustrack", prevChapter ? () => previousEvent() : null],
      ["nexttrack", nextChapter ? () => nextEvent() : null],
    ];
    for (const [action, handler] of handlers) {
      try { media.setActionHandler(action, handler); } catch { /* Some browsers implement only a subset of actions. */ }
    }
    return () => {
      for (const [action] of handlers) { try { media.setActionHandler(action, null); } catch { /* Unsupported action. */ } }
      media.metadata = null;
      media.playbackState = "none";
    };
  }, [chapter.tieuDeChuong, story.tenTruyen, story.anhBia, prevChapter, nextChapter]);

  const isPlaying = status === "fallback" ? narration.state === "playing" : playing;
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    if (navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState(status === "ready" && duration > 0
          ? { duration, playbackRate: preferences.rate, position: Math.min(time, duration) } : undefined);
      } catch { /* Position reporting is optional on older browser engines. */ }
    }
  }, [isPlaying, status, duration, time, preferences.rate]);

  return (
    <section aria-label="Trình phát audio chương" className="fixed inset-x-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 mx-auto max-h-[calc(100dvh-11rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-4 text-[var(--reader-text)] shadow-xl md:bottom-6">
      <audio ref={audioRef} playsInline preload="metadata"
        onLoadedMetadata={() => { const value = audioRef.current?.duration ?? 0; setDuration(Number.isFinite(value) ? value : 0); }}
        onDurationChange={() => { const value = audioRef.current?.duration ?? 0; setDuration(Number.isFinite(value) ? value : 0); }}
        onTimeUpdate={() => setTime(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); if (preferences.autoNext && nextChapter) goToChapter(nextChapter); }}
        onError={() => { setPlaying(false); setStatus("error"); setError("Không thể tải tệp audio. Hãy nhấn Phát để kiểm tra quyền và thử lại."); }}
      />
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold"><Headphones className="size-4 shrink-0" aria-hidden="true" />Nghe truyện</h2>
          <p className="mt-1 truncate text-xs opacity-75" title={chapter.tieuDeChuong}>{chapter.tieuDeChuong}</p>
        </div>
        <button type="button" className={buttonClass} onClick={() => { stop(); onClose(); }} aria-label="Đóng trình phát audio"><X className="size-5" aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center justify-items-center gap-1">
        <button type="button" disabled={status !== "ready" || !duration} className={buttonClass} onClick={() => seek(time - 15)} aria-label="Tua lùi 15 giây"><RotateCcw className="size-5" aria-hidden="true" /></button>
        <button type="button" disabled={status === "loading"} className={buttonClass + " !bg-[var(--reader-accent)] !text-[var(--reader-surface)] hover:opacity-85"} onClick={play} aria-label={isPlaying ? "Tạm dừng audio" : "Phát audio"}>
          {status === "loading" ? <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" /> : isPlaying ? <Pause className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
        </button>
        <button type="button" disabled={status !== "ready" || !duration} className={buttonClass} onClick={() => seek(time + 15)} aria-label="Tua tới 15 giây"><RotateCw className="size-5" aria-hidden="true" /></button>
        <button type="button" className={buttonClass} onClick={stop} aria-label="Dừng audio"><Square className="size-4" aria-hidden="true" /></button>
      </div>
      <label className="sr-only" htmlFor="chapter-audio-seek">Vị trí phát audio</label>
      <input id="chapter-audio-seek" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration)}
        disabled={status !== "ready" || !duration} onChange={(event) => seek(Number(event.target.value))}
        className="h-9 w-full accent-[var(--reader-accent)] focus-visible:outline-2 disabled:opacity-40" />
      <div className="mb-3 flex justify-between text-xs tabular-nums"><span>{clock(time)}</span><span>{clock(duration)}</span></div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="space-y-1 text-xs"><span>Giọng kể chuyện</span>
          <select aria-label="Giọng kể chuyện" value={preferences.voice} onChange={(event) => {
            const selected = voiceSchema.safeParse(event.target.value);
            if (!selected.success) return;
            stop(); audioRef.current?.removeAttribute("src"); audioRef.current?.load();
            setDuration(0); setStatus("idle"); setError(""); updatePreferences({ voice: selected.data });
          }} className={selectClass}>
            {voiceSchema.options.map((voice) => <option key={voice} value={voice}>{storyVoices[voice].label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span>Tốc độ</span>
          <select aria-label="Tốc độ" value={preferences.rate} onChange={(event) => updatePreferences({ rate: Number(event.target.value) })} className={selectClass}>
            {playbackRates.map((rate) => <option key={rate} value={rate}>{rate === 1 ? "1.0" : rate}x</option>)}
          </select>
        </label>
      </div>
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-xs">
        <input type="checkbox" checked={preferences.autoNext} onChange={(event) => updatePreferences({ autoNext: event.target.checked })} className="size-4 accent-[var(--reader-accent)]" />
        Tự động chuyển chương kế tiếp
      </label>
      <p role="status" className="mt-1 text-xs leading-relaxed opacity-80">
        {status === "loading" ? "Đang chuẩn bị audio, lần đầu có thể mất vài phút…" :
          status === "fallback" ? "Đang dùng giọng tiếng Việt của thiết bị. Tua thời gian chỉ dùng với MP3." :
          status === "ready" ? cached ? "Audio đã lưu sẵn." : "Audio đã sẵn sàng và được lưu cho lần nghe sau." : "Chọn giọng rồi nhấn Phát để nghe."}
      </p>
      {(error || narration.error) && <p role="alert" className="mt-2 text-xs leading-relaxed text-[var(--reader-error)]">{narration.error || error}</p>}
      {status === "fallback" && <button type="button" className="mt-2 min-h-11 rounded-lg border border-[var(--reader-border)] px-3 text-xs font-semibold focus-visible:outline-2" onClick={() => { narration.stop(); void loadAndPlay(); }}>Thử tải lại MP3</button>}
    </section>
  );
}
