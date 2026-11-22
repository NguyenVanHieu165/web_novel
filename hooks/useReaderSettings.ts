"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  defaultReaderSettings,
  parseReaderSettings,
  parseReaderSettingsCookie,
  readerSettingsCookieMaxAge,
  readerSettingsCookieName,
  serializeReaderSettingsCookie,
  type ReaderSettings,
} from "@/lib/reader-settings";

const changeEvent = "web-novel-reader-settings";
const legacyKeys = ["reader_theme", "reader_font_size", "reader_font_family", "reader_line_height"];
let snapshot: ReaderSettings | null = null;

function readCookie(): ReaderSettings | null {
  try {
    const value = document.cookie.split(";").map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${readerSettingsCookieName}=`))
      ?.slice(readerSettingsCookieName.length + 1);
    return parseReaderSettingsCookie(value);
  } catch {
    return null;
  }
}

function writeCookie(settings: ReaderSettings) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${readerSettingsCookieName}=${serializeReaderSettingsCookie(settings)}; Path=/; Max-Age=${readerSettingsCookieMaxAge}; SameSite=Lax${secure}`;
  } catch {
    // Session preferences remain usable when cookies are blocked.
  }
}

function getSnapshot(initialSettings: ReaderSettings): ReaderSettings {
  if (typeof window === "undefined") return initialSettings;
  if (snapshot) return snapshot;

  const cookieSettings = readCookie();
  if (cookieSettings) {
    snapshot = cookieSettings;
    return snapshot;
  }

  try {
    const storedSettings = parseReaderSettingsCookie(localStorage.getItem(readerSettingsCookieName) ?? undefined);
    const legacyValues = legacyKeys.map((key) => localStorage.getItem(key));
    snapshot = storedSettings ?? (legacyValues.some((value) => value !== null)
      ? parseReaderSettings({ theme: legacyValues[0], fontSize: legacyValues[1], fontFamily: legacyValues[2], lineHeight: legacyValues[3] })
      : initialSettings);
  } catch {
    snapshot = initialSettings;
  }
  return snapshot;
}

function persist(settings: ReaderSettings) {
  try {
    localStorage.setItem(readerSettingsCookieName, serializeReaderSettingsCookie(settings));
    localStorage.setItem("reader_theme", settings.theme);
    localStorage.setItem("reader_font_size", String(settings.fontSize));
    localStorage.setItem("reader_font_family", settings.fontFamily);
    localStorage.setItem("reader_line_height", String(settings.lineHeight));
  } catch {
    // Cookie/session preferences still work when persistent storage is unavailable.
  }
  writeCookie(settings);
}

function subscribe(onChange: () => void, initialSettings: ReaderSettings) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === readerSettingsCookieName) {
      const incoming = parseReaderSettingsCookie(event.newValue ?? undefined);
      if (incoming) {
        snapshot = incoming;
        writeCookie(incoming);
      } else {
        snapshot = null;
      }
      onChange();
    } else if (event.key === null || legacyKeys.includes(event.key)) {
      snapshot = null;
      onChange();
    }
  };
  // Migrate legacy/browser-only preferences after hydration, never during SSR/render.
  persist(getSnapshot(initialSettings));
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, onChange);
  };
}

function updateSettings(update: Partial<ReaderSettings>) {
  snapshot = parseReaderSettings({ ...getSnapshot(defaultReaderSettings), ...update });
  persist(snapshot);
  window.dispatchEvent(new Event(changeEvent));
}

export function useReaderSettings(initialSettings: ReaderSettings = defaultReaderSettings) {
  // The server snapshot belongs to this render tree, never to the module-level browser cache.
  const serverSnapshot = useMemo(() => parseReaderSettings(initialSettings), [initialSettings]);
  const getServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot]);
  const getClientSnapshot = useCallback(() => getSnapshot(serverSnapshot), [serverSnapshot]);
  const subscribeWithSeed = useCallback((onChange: () => void) => subscribe(onChange, serverSnapshot), [serverSnapshot]);
  const settings = useSyncExternalStore(subscribeWithSeed, getClientSnapshot, getServerSnapshot);
  return { settings, updateSettings };
}
