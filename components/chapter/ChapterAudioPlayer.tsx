"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Headphones, Pause, Play, X } from "lucide-react";
import type { ChapterDetailData } from "@/lib/mappers/chapter.mapper";
import { getChapterPath } from "@/lib/reader-navigation";
import { continueAudioAt } from "@/lib/tts/audio-continuation";
import { useReaderNavigation } from "./ReaderNavigationProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const voices = [
  { id: "vi-VN-HoaiMyNeural", label: "Hoài My · Nữ" },
  { id: "vi-VN-NamMinhNeural", label: "Nam Minh · Nam" },
] as const;
const rates = [0.75, 1, 1.25, 1.5, 2] as const;
type Voice = (typeof voices)[number]["id"];
type Meta = { chapterId: number; title: string; totalChunks: number; voice: Voice };
const apiBase = "/api/tts";

export default function ChapterAudioPlayer({ data, onClose }: { data: ChapterDetailData; onClose: () => void }) {
  const { chapter, story, prevChapter, nextChapter } = data;
  const { navigate } = useReaderNavigation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const urls = useRef(new Map<string, string>());
  const requests = useRef(new Map<string, Promise<string>>());
  const [voice, setVoice] = useState<Voice>(voices[0].id);
  const [rate, setRate] = useState<(typeof rates)[number]>(1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaVoice, setMetaVoice] = useState<Voice | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [error, setError] = useState("");

  const goToChapter = useCallback((slug: string) => {
    const destination = getChapterPath(story.slug, slug);
    continueAudioAt(destination);
    navigate(destination);
  }, [navigate, story.slug]);

  const getChunk = useCallback((chunkIndex: number, selectedVoice: Voice, total: number) => {
    const cacheKey = `${selectedVoice}:${chunkIndex}`;
    const found = urls.current.get(cacheKey);
    if (found) return Promise.resolve(found);
    const inflight = requests.current.get(cacheKey);
    if (inflight) return inflight;
    const request = fetch(`${apiBase}/chapters/${chapter.idChuong}/chunk/${chunkIndex}?voice=${selectedVoice}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Bạn cần đăng nhập và mở khóa chương để nghe." : "Chưa thể tải đoạn audio.");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (chunkIndex < total) urls.current.set(cacheKey, url);
        return url;
      }).finally(() => requests.current.delete(cacheKey));
    requests.current.set(cacheKey, request);
    return request;
  }, [chapter.idChuong]);

  const playChunk = useCallback(async (chunkIndex: number, shouldPlay = true) => {
    if (!meta || meta.voice !== voice || chunkIndex < 0 || chunkIndex >= meta.totalChunks) return;
    setBusy(true); setError("");
    try {
      const url = await getChunk(chunkIndex, voice, meta.totalChunks);
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      audio.playbackRate = rate;
      audio.load();
      setIndex(chunkIndex);
      for (const [key, oldUrl] of urls.current) {
        const [cachedVoice, cachedIndex] = key.split(":");
        const parsedIndex = Number(cachedIndex);
        if (cachedVoice !== voice || parsedIndex < chunkIndex - 1 || parsedIndex > chunkIndex + 1) {
          URL.revokeObjectURL(oldUrl);
          urls.current.delete(key);
        }
      }
      if (shouldPlay) await audio.play();
      if (chunkIndex + 1 < meta.totalChunks) void getChunk(chunkIndex + 1, voice, meta.totalChunks).catch(() => undefined);
    } catch (failure) {
      setPlaying(false);
      setError(failure instanceof Error ? failure.message : "Kết nối audio bị gián đoạn.");
    } finally { setBusy(false); }
  }, [getChunk, meta, rate, voice]);

  const onEnded = useCallback(() => {
    if (meta && index + 1 < meta.totalChunks) void playChunk(index + 1);
    else if (autoNext && nextChapter) goToChapter(nextChapter.slug);
    else setPlaying(false);
  }, [autoNext, goToChapter, index, meta, nextChapter, playChunk]);

  useEffect(() => {
    let active = true;
    void fetch(`${apiBase}/chapters/${chapter.idChuong}/meta?voice=${voice}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Bạn cần đăng nhập và mở khóa chương để nghe." : "Chưa thể tải thông tin chương.");
        return response.json() as Promise<Meta>;
      }).then((value) => { if (active) { setMeta(value); setMetaVoice(voice); } })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Không thể kết nối máy chủ audio."); });
    return () => { active = false; };
  }, [chapter.idChuong, voice]);

  useEffect(() => {
    const audio = audioRef.current;
    const clear = () => {
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
      for (const url of urls.current.values()) URL.revokeObjectURL(url);
      urls.current.clear(); requests.current.clear();
    };
    const leave = () => audio?.pause();
    window.addEventListener("pagehide", leave);
    window.addEventListener("reader-leaving", leave);
    return () => { clear(); window.removeEventListener("pagehide", leave); window.removeEventListener("reader-leaving", leave); };
  }, [chapter.idChuong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const media = navigator.mediaSession;
    if ("MediaMetadata" in window) media.metadata = new MediaMetadata({ title: chapter.tieuDeChuong, artist: story.tenTruyen, album: story.tenTruyen });
    const actions: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => { if (audioRef.current?.src) void audioRef.current.play(); else void playChunk(index); }],
      ["pause", () => audioRef.current?.pause()],
      ["previoustrack", () => { if (index > 0) void playChunk(index - 1); else if (prevChapter) goToChapter(prevChapter.slug); }],
      ["nexttrack", () => { if (meta && index + 1 < meta.totalChunks) void playChunk(index + 1); else if (nextChapter) goToChapter(nextChapter.slug); }],
    ];
    for (const [action, handler] of actions) { try { media.setActionHandler(action, handler); } catch { /* Action not supported by browser. */ } }
    return () => { for (const [action] of actions) { try { media.setActionHandler(action, null); } catch { /* Action not supported. */ } } media.metadata = null; };
  }, [chapter.tieuDeChuong, goToChapter, index, meta, nextChapter, playChunk, prevChapter, story.tenTruyen]);

  const toggle = () => {
    const audio = audioRef.current;
    if (playing) audio?.pause();
    else if (audio?.src) void audio.play().catch(() => setError("Chạm Phát để bắt đầu nghe."));
    else void playChunk(index);
  };

  return (
    <section aria-label="Trình phát nghe truyện" className="fixed inset-x-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-4 text-[var(--reader-text)] shadow-xl md:bottom-6">
      <audio ref={audioRef} playsInline preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} />
      <div className="mb-3 flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-bold"><Headphones className="size-4" aria-hidden="true"/>Nghe truyện</h2><p className="truncate text-xs opacity-75">{chapter.tieuDeChuong}</p></div><Button type="button" variant="ghost" size="icon" aria-label="Đóng trình phát" onClick={() => { audioRef.current?.pause(); onClose(); }}><X className="size-4"/></Button></div>
      <div className="flex items-center justify-center gap-4"><Button type="button" variant="ghost" size="icon" aria-label="Lùi một đoạn" disabled={index <= 0 || busy} onClick={() => void playChunk(index - 1)}><ChevronLeft/></Button><Button type="button" variant="default" size="icon" aria-label={playing ? "Tạm dừng" : "Phát"} disabled={busy || !meta || metaVoice !== voice} onClick={toggle}>{playing ? <Pause/> : <Play/>}</Button><Button type="button" variant="ghost" size="icon" aria-label="Tiến một đoạn" disabled={!meta || index + 1 >= meta.totalChunks || busy} onClick={() => void playChunk(index + 1)}><ChevronRight/></Button></div>
      <p className="my-2 text-center text-xs" aria-live="polite">{busy ? "Đang tải đoạn…" : meta ? `Đoạn ${Math.min(index + 1, meta.totalChunks)} / ${meta.totalChunks}` : metaVoice !== voice ? "Đang tải giọng đọc…" : "Đang kết nối…"}</p>
      <label className="sr-only" htmlFor="tts-chunk-progress">Tiến độ đoạn audio</label><Input id="tts-chunk-progress" type="range" min={0} max={Math.max(0, (meta?.totalChunks ?? 1) - 1)} value={Math.min(index, Math.max(0, (meta?.totalChunks ?? 1) - 1))} onChange={(event) => void playChunk(Number(event.target.value), playing)} className="accent-[var(--reader-accent)]" disabled={!meta}/>
      <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Giọng đọc<select aria-label="Giọng đọc" value={voice} onChange={(event) => { audioRef.current?.pause(); setPlaying(false); setIndex(0); setVoice(event.target.value as Voice); }} className="mt-1 min-h-10 w-full rounded-md border border-[var(--reader-border)] bg-[var(--reader-bg)] px-2 text-[var(--reader-text)]">{voices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs">Tốc độ<select aria-label="Tốc độ phát" value={rate} onChange={(event) => setRate(Number(event.target.value) as (typeof rates)[number])} className="mt-1 min-h-10 w-full rounded-md border border-[var(--reader-border)] bg-[var(--reader-bg)] px-2 text-[var(--reader-text)]">{rates.map((item) => <option key={item} value={item}>{item}x</option>)}</select></label></div>
      <label className="mt-2 flex min-h-10 items-center gap-2 text-xs"><input type="checkbox" checked={autoNext} onChange={(event) => setAutoNext(event.target.checked)} />Tự động chuyển chương tiếp theo</label>
      {error && <p role="alert" className="mt-2 text-xs text-[var(--reader-error)]">{error}</p>}
    </section>
  );
}
