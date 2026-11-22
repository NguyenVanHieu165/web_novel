export interface ReaderParagraphRect {
  top: number;
  bottom: number;
}

export interface ReaderTypographyAnchor {
  index: number;
  fraction: number;
  viewportY: number;
}

// The chapter's direct paragraph children are ordered vertically; find the reading line in O(log n) reads.
export function findReaderTypographyAnchor({
  count,
  readRect,
  articleRect,
  viewportHeight,
  readingLine = 80,
}: {
  count: number;
  readRect: (index: number) => ReaderParagraphRect;
  articleRect: ReaderParagraphRect;
  viewportHeight: number;
  readingLine?: number;
}): ReaderTypographyAnchor | null {
  if (
    count <= 0 || readingLine < 0 || viewportHeight <= readingLine ||
    articleRect.top > readingLine || articleRect.bottom <= readingLine
  ) return null;

  let left = 0;
  let right = count;
  const bounds = new Map<number, ReaderParagraphRect>();
  const getRect = (index: number) => {
    const cached = bounds.get(index);
    if (cached) return cached;
    const rect = readRect(index);
    bounds.set(index, rect);
    return rect;
  };
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (getRect(middle).bottom <= readingLine) left = middle + 1;
    else right = middle;
  }
  if (left >= count) return null;
  const rect = getRect(left);
  const height = rect.bottom - rect.top;
  if (!Number.isFinite(height) || height <= 0 || rect.top >= viewportHeight) return null;
  const fraction = Math.max(0, Math.min(1, (readingLine - rect.top) / height));
  return { index: left, fraction, viewportY: rect.top + height * fraction };
}

export function readerTypographyScrollTop({
  anchor,
  paragraphRect,
  scrollTop,
  maxScrollTop,
}: {
  anchor: ReaderTypographyAnchor;
  paragraphRect: ReaderParagraphRect;
  scrollTop: number;
  maxScrollTop: number;
}): number {
  const point = paragraphRect.top + (paragraphRect.bottom - paragraphRect.top) * anchor.fraction;
  const desired = scrollTop + point - anchor.viewportY;
  return Math.max(0, Math.min(Math.max(0, maxScrollTop), desired));
}
