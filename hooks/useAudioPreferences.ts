"use client";

import { useSyncExternalStore } from "react";
import { audioPreferencesSchema, defaultAudioPreferences, type AudioPreferences } from "@/lib/tts/voices";

const key = "web-novel:audio-preferences:v1";
const eventName = "web-novel:audio-preferences";
let snapshot: AudioPreferences | null = null;

function getSnapshot(): AudioPreferences {
  if (snapshot) return snapshot;
  try {
    const parsed = audioPreferencesSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
    snapshot = parsed.success ? parsed.data : defaultAudioPreferences;
  } catch { snapshot = defaultAudioPreferences; }
  return snapshot;
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) { snapshot = null; notify(); }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(eventName, notify);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(eventName, notify); };
}
function updatePreferences(update: Partial<AudioPreferences>) {
  const parsed = audioPreferencesSchema.safeParse({ ...getSnapshot(), ...update });
  if (!parsed.success) return;
  snapshot = parsed.data;
  try { localStorage.setItem(key, JSON.stringify(snapshot)); }
  catch { /* Keep the current session usable when persistent storage is blocked. */ }
  window.dispatchEvent(new Event(eventName));
}
export function useAudioPreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, () => defaultAudioPreferences);
  return { preferences, updatePreferences };
}
