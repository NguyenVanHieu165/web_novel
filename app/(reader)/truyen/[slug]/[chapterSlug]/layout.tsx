import { cookies } from "next/headers";
import type { ReactNode } from "react";
import ReaderAppearance from "@/components/chapter/ReaderAppearance";
import {
  defaultReaderSettings,
  parseReaderSettingsCookie,
  readerSettingsCookieName,
} from "@/lib/reader-settings";

export default async function ChapterReaderLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialSettings =
    parseReaderSettingsCookie(cookieStore.get(readerSettingsCookieName)?.value) ??
    defaultReaderSettings;

  return <ReaderAppearance initialSettings={initialSettings}>{children}</ReaderAppearance>;
}
