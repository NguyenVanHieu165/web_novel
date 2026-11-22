"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { getReaderStyleVariables, type ReaderSettings } from "@/lib/reader-settings";

type ReaderPreferences = ReturnType<typeof useReaderSettings>;

const ReaderPreferencesContext = createContext<ReaderPreferences | null>(null);

export function useReaderPreferences() {
  const preferences = useContext(ReaderPreferencesContext);
  if (!preferences) throw new Error("Reader preferences require ReaderAppearance.");
  return preferences;
}

export default function ReaderAppearance({
  initialSettings,
  children,
}: {
  initialSettings: ReaderSettings;
  children: ReactNode;
}) {
  const preferences = useReaderSettings(initialSettings);
  return (
    <ReaderPreferencesContext value={preferences}>
      <div
        data-reader-theme={preferences.settings.theme}
        style={getReaderStyleVariables(preferences.settings)}
        className="min-h-screen bg-[var(--reader-bg)] text-[var(--reader-text)]"
      >
        {children}
      </div>
    </ReaderPreferencesContext>
  );
}
