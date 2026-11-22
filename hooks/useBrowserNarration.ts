"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { storyVoices, type StoryVoice } from "@/lib/tts/voices";

export function useBrowserNarration({ voice, rate, onEnded }: { voice: StoryVoice; rate: number; onEnded?: () => void }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const active = useRef<HTMLElement | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  const options = useRef({ voice, rate, onEnded });

  useEffect(() => { options.current = { voice, rate, onEnded }; }, [voice, rate, onEnded]);
  const stop = useCallback(() => {
    sequence.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    active.current?.removeAttribute("data-speaking");
    active.current = null;
    utterance.current = null;
    setState("idle");
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const sequenceRef = sequence;
    const load = () => { voices.current = synth.getVoices(); };
    load();
    synth.addEventListener("voiceschanged", load);
    window.addEventListener("reader-leaving", stop);
    window.addEventListener("pagehide", stop);
    return () => {
      sequenceRef.current++;
      synth.cancel();
      active.current?.removeAttribute("data-speaking");
      synth.removeEventListener("voiceschanged", load);
      window.removeEventListener("reader-leaving", stop);
      window.removeEventListener("pagehide", stop);
    };
  }, [stop]);

  const start = useCallback((): boolean => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setError("Trình duyệt chưa hỗ trợ đọc dự phòng. Hãy thử tải lại audio.");
      return false;
    }
    const vietnamese = voices.current.filter((candidate) => /^vi(?:-|_)/iu.test(candidate.lang));
    if (!vietnamese.length) {
      setError("Chưa có giọng tiếng Việt trên thiết bị. Hãy cài giọng tiếng Việt hoặc thử tải lại audio.");
      return false;
    }
    stop();
    setError("");
    const id = sequence.current;
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("#reader-content > p"));
    let index = Math.max(0, paragraphs.findIndex((paragraph) => paragraph.getBoundingClientRect().bottom > 100));
    const speak = () => {
      if (sequence.current !== id) return;
      active.current?.removeAttribute("data-speaking");
      const paragraph = paragraphs[index++];
      if (!paragraph) { stop(); options.current.onEnded?.(); return; }
      const profile = storyVoices[options.current.voice];
      const selected = vietnamese.find((candidate) => candidate.name.includes(
        options.current.voice === "male-deep" ? "NamMinh" : "HoaiMy",
      )) ?? vietnamese[0];
      const item = new SpeechSynthesisUtterance(paragraph.textContent ?? "");
      item.lang = "vi-VN";
      item.voice = selected;
      item.rate = options.current.rate * profile.browserRate;
      item.pitch = profile.browserPitch;
      item.onstart = () => {
        if (sequence.current !== id) return;
        active.current = paragraph;
        paragraph.dataset.speaking = "true";
      };
      item.onend = speak;
      item.onerror = (event) => {
        if (sequence.current !== id || event.error === "canceled" || event.error === "interrupted") return;
        stop();
        setError("Không thể phát giọng dự phòng. Hãy thử tải lại audio.");
      };
      utterance.current = item;
      try { window.speechSynthesis.speak(item); }
      catch { stop(); setError("Không thể phát giọng dự phòng. Hãy thử lại."); }
    };
    setState("playing");
    speak();
    return true;
  }, [stop]);

  const pause = () => { window.speechSynthesis.pause(); setState("paused"); };
  const resume = () => { window.speechSynthesis.resume(); setState("playing"); };
  return { state, error, start, stop, pause, resume };
}
