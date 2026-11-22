export interface ReaderKeyboardInput {
  key: string;
  defaultPrevented?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  blocked?: boolean;
  interactive?: boolean;
}

export function getStoryPath(storySlug: string): string {
  return `/truyen/${encodeURIComponent(storySlug)}`;
}

export function getChapterPath(storySlug: string, chapterSlug: string): string {
  return `${getStoryPath(storySlug)}/${encodeURIComponent(chapterSlug)}`;
}

export function isChapterPath(pathname: string): boolean {
  return /^\/truyen\/[^/]+\/[^/]+\/?$/.test(pathname);
}

export function readerKeyboardDirection(input: ReaderKeyboardInput): "previous" | "next" | null {
  if (
    input.blocked || input.interactive || input.defaultPrevented || input.repeat || input.isComposing ||
    input.altKey || input.ctrlKey || input.metaKey || input.shiftKey
  ) return null;
  return input.key === "ArrowLeft" ? "previous" : input.key === "ArrowRight" ? "next" : null;
}

export interface ReaderClickInput {
  button: number;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: string | null;
  download?: boolean;
}

// Modified clicks and new-window targets must retain ordinary anchor semantics.
export function shouldHandleReaderClick(input: ReaderClickInput): boolean {
  return input.button === 0 && !input.defaultPrevented && !input.altKey && !input.ctrlKey &&
    !input.metaKey && !input.shiftKey && !input.download && (!input.target || input.target === "_self");
}

export interface ReaderLeavingDetail {
  chapterId: number;
  waitUntil: (promise: Promise<unknown>) => void;
}

// Let progress listeners flush before navigation, with a bounded wait for a slow/offline network.
export async function waitForReaderLeave(chapterId: number, timeoutMs = 1200): Promise<void> {
  const pending: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent<ReaderLeavingDetail>("reader-leaving", {
    detail: { chapterId, waitUntil: (promise) => { pending.push(promise); } },
  }));
  if (pending.length === 0) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(pending),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
