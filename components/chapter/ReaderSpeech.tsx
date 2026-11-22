"use client";

import { useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { useBrowserNarration } from "@/hooks/useBrowserNarration";

const buttonClass = "grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--reader-bg)] focus-visible:outline-2 focus-visible:outline-[var(--reader-accent)]";

/** Standalone browser reader; the chapter audio player reuses the same narration hook. */
export default function ReaderSpeech({ onClose }: { onClose: () => void }) {
  const [rate, setRate] = useState(1);
  const speech = useBrowserNarration({ voice: "female-warm", rate });
  return (
    <section aria-label="Điều khiển nghe đọc" className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-sm rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3 text-[var(--reader-text)] shadow-xl md:bottom-6">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={buttonClass} onClick={() => {
          if (speech.state === "playing") speech.pause();
          else if (speech.state === "paused") speech.resume();
          else speech.start();
        }} aria-label={speech.state === "playing" ? "Tạm dừng nghe đọc" : "Phát nghe đọc"}>
          {speech.state === "playing" ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
        </button>
        <label className="flex flex-col gap-1 text-xs">Tốc độ
          <select value={rate} onChange={(event) => setRate(Number(event.target.value))} className="min-h-11 rounded-lg border border-[var(--reader-border)] bg-[var(--reader-surface)] px-2 text-[var(--reader-text)] focus-visible:outline-2">
            {[1, 1.1, 1.2, 1.3, 1.4, 1.5].map((speed) => <option key={speed} value={speed}>{speed.toFixed(1)}x</option>)}
          </select>
        </label>
        <button type="button" className={buttonClass} onClick={speech.stop} aria-label="Dừng nghe đọc"><Square aria-hidden="true" className="size-5" /></button>
        <button type="button" className={buttonClass} onClick={() => { speech.stop(); onClose(); }} aria-label="Đóng nghe đọc"><X aria-hidden="true" className="size-5" /></button>
      </div>
      <p role="status" className="mt-2 text-xs opacity-75">{speech.state === "playing" ? "Đang đọc · Đoạn hiện tại được tô sáng" : speech.state === "paused" ? "Đã tạm dừng" : "Nghe từ đoạn đang xem"} · Tốc độ áp dụng từ đoạn tiếp theo.</p>
      {speech.error && <p role="alert" className="mt-2 text-xs text-[var(--reader-error)]">{speech.error}</p>}
    </section>
  );
}
