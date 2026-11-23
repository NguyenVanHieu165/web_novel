"use client";

import { useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { useBrowserNarration } from "@/hooks/useBrowserNarration";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReaderPreferences } from "./ReaderAppearance";
import { getReaderStyleVariables } from "@/lib/reader-settings";

const buttonClass = "size-11 shrink-0 rounded-full text-[var(--reader-text)] hover:bg-[var(--reader-bg)] hover:text-[var(--reader-text)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40";

/** Standalone browser reader; the chapter audio player reuses the same narration hook. */
export default function ReaderSpeech({ onClose }: { onClose: () => void }) {
  const [rate, setRate] = useState(1);
  const { settings } = useReaderPreferences();
  const readerStyle = getReaderStyleVariables(settings);
  const speech = useBrowserNarration({ voice: "female-warm", rate });
  return (
    <section aria-label="Điều khiển nghe đọc" className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-sm rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-surface)] p-3 text-[var(--reader-text)] shadow-xl md:bottom-6">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="icon" className={buttonClass} onClick={() => {
          if (speech.state === "playing") speech.pause();
          else if (speech.state === "paused") speech.resume();
          else speech.start();
        }} aria-label={speech.state === "playing" ? "Tạm dừng nghe đọc" : "Phát nghe đọc"} title={speech.state === "playing" ? "Tạm dừng nghe đọc" : "Phát nghe đọc"}>
          {speech.state === "playing" ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
        </Button>
        <div className="flex flex-col gap-1 text-xs"><span id="reader-speech-rate-label">Tốc độ</span>
          <Select value={String(rate)} onValueChange={(value) => setRate(Number(value))}>
            <SelectTrigger aria-labelledby="reader-speech-rate-label" className="min-h-11 border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)] hover:bg-[var(--reader-bg)] focus-visible:border-[var(--reader-accent)] focus-visible:ring-[var(--reader-accent)]/40"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" style={readerStyle} data-reader-theme={settings.theme} className="border-[var(--reader-border)] bg-[var(--reader-surface)] text-[var(--reader-text)]">
              {[1, 1.1, 1.2, 1.3, 1.4, 1.5].map((speed) => <SelectItem key={speed} value={String(speed)} className="focus:bg-[var(--reader-bg)] focus:text-[var(--reader-text)]">{speed.toFixed(1)}x</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="ghost" size="icon" className={buttonClass} onClick={speech.stop} aria-label="Dừng nghe đọc" title="Dừng nghe đọc"><Square aria-hidden="true" className="size-5" /></Button>
        <Button type="button" variant="ghost" size="icon" className={buttonClass} onClick={() => { speech.stop(); onClose(); }} aria-label="Đóng nghe đọc" title="Đóng nghe đọc"><X aria-hidden="true" className="size-5" /></Button>
      </div>
      <p role="status" className="mt-2 text-xs opacity-75">{speech.state === "playing" ? "Đang đọc · Đoạn hiện tại được tô sáng" : speech.state === "paused" ? "Đã tạm dừng" : "Nghe từ đoạn đang xem"} · Tốc độ áp dụng từ đoạn tiếp theo.</p>
      {speech.error && <Alert variant="destructive" role="alert" className="mt-2 border-[var(--reader-error)]/30 bg-transparent text-[var(--reader-error)]"><AlertDescription className="text-xs">{speech.error}</AlertDescription></Alert>}
    </section>
  );
}
