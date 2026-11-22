export function parseAudioRange(header: string | null, size: number):
  { start: number; end: number; partial: boolean } | null {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 ||
    start >= size || end < start || (!match[1] && Number(match[2]) === 0)) return null;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return { start, end, partial: true };
}
