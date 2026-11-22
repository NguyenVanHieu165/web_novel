"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import { parseReaderSettings, type ReaderSettings } from "@/lib/reader-settings";
import {
  findReaderTypographyAnchor,
  readerTypographyScrollTop,
  type ReaderTypographyAnchor,
} from "@/lib/reader-typography-anchor";

interface PendingAnchor {
  article: HTMLElement;
  paragraph: Element;
  anchor: ReaderTypographyAnchor;
}

export function useReaderTypographyAnchor(
  settings: ReaderSettings,
  updateSettings: (update: Partial<ReaderSettings>) => void,
) {
  const pending = useRef<PendingAnchor | null>(null);

  useLayoutEffect(() => {
    const saved = pending.current;
    if (!saved) return;
    pending.current = null;
    if (!saved.article.isConnected || !saved.paragraph.isConnected || !saved.article.contains(saved.paragraph)) return;

    const scrollTop = readerTypographyScrollTop({
      anchor: saved.anchor,
      paragraphRect: saved.paragraph.getBoundingClientRect(),
      scrollTop: window.scrollY,
      maxScrollTop: document.documentElement.scrollHeight - window.innerHeight,
    });
    if (Math.abs(scrollTop - window.scrollY) >= 1) {
      window.dispatchEvent(new Event("reader-layout"));
      window.scrollTo({ top: scrollTop, behavior: "instant" });
    }
  }, [settings.fontSize, settings.fontFamily, settings.lineHeight, settings.width]);

  return useCallback((update: Partial<ReaderSettings>) => {
    const next = parseReaderSettings({ ...settings, ...update });
    const typographyChanged = next.fontSize !== settings.fontSize ||
      next.fontFamily !== settings.fontFamily || next.lineHeight !== settings.lineHeight ||
      next.width !== settings.width;

    if (typographyChanged) {
      window.dispatchEvent(new Event("reader-layout"));
      const article = document.getElementById("reader-content");
      if (!article) pending.current = null;
      else if (!pending.current || pending.current.article !== article || !pending.current.paragraph.isConnected) {
        const anchor = findReaderTypographyAnchor({
          count: article.children.length,
          readRect: (index) => article.children[index].getBoundingClientRect(),
          articleRect: article.getBoundingClientRect(),
          viewportHeight: window.innerHeight,
        });
        pending.current = anchor ? { article, paragraph: article.children[anchor.index], anchor } : null;
      }
    }
    updateSettings(update);
  }, [settings, updateSettings]);
}
