export type ReaderTextColor = "auto" | `#${string}`;

export interface ReaderSettings {
  theme: "light" | "sepia" | "mint" | "dark";
  fontSize: number;
  fontFamily: "sans" | "serif";
  lineHeight: number;
  width: "narrow" | "standard" | "wide";
  textColor: ReaderTextColor;
}

export const readerSettingsCookieName = "web_novel_reader_settings";
export const readerSettingsCookieMaxAge = 60 * 60 * 24 * 365;
export const readerFontSizeMin = 16;
export const readerFontSizeMax = 26;
export const readerLineHeights = [1.6, 1.8, 2, 2.2] as const;

export const defaultReaderSettings: ReaderSettings = Object.freeze({
  theme: "light", fontSize: 18, fontFamily: "sans", lineHeight: 1.8, width: "standard", textColor: "auto",
});

const readerWidths = { narrow: "38rem", standard: "48rem", wide: "60rem" } as const;

const parseNumber = (value: unknown): number =>
  typeof value === "number" || (typeof value === "string" && value.trim() !== "")
    ? Number(value)
    : Number.NaN;

const parseTextColor = (value: unknown): ReaderTextColor =>
  typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
    ? value.toLowerCase() as ReaderTextColor
    : "auto";

export function parseReaderSettings(value: unknown): ReaderSettings {
  const source = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Partial<Record<keyof ReaderSettings, unknown>>
    : {};
  const fontSize = parseNumber(source.fontSize);
  const lineHeight = parseNumber(source.lineHeight);
  return {
    theme: source.theme === "oled" ? "dark" :
      source.theme === "sepia" || source.theme === "dark" || source.theme === "mint" ? source.theme : "light",
    fontFamily: source.fontFamily === "serif" ? "serif" : "sans",
    fontSize: Number.isInteger(fontSize) && fontSize >= 14 && fontSize <= 28
      ? Math.max(readerFontSizeMin, Math.min(readerFontSizeMax, fontSize)) : defaultReaderSettings.fontSize,
    lineHeight: readerLineHeights.some((height) => height === lineHeight)
      ? lineHeight : defaultReaderSettings.lineHeight,
    width: source.width === "narrow" || source.width === "wide" ? source.width : "standard",
    textColor: parseTextColor(source.textColor),
  };
}

/** Cookie and local storage contain settings only; unknown versions are ignored. */
export function parseReaderSettingsCookie(value: string | undefined): ReaderSettings | null {
  if (!value || value.length > 96) return null;
  const current = /^3:(light|sepia|mint|dark):(1[6-9]|2[0-6]):(sans|serif):(1\.6|1\.8|2|2\.2):(narrow|standard|wide):(auto|[0-9a-f]{6})$/iu;
  const previous = /^2:(light|sepia|mint|dark):(1[6-9]|2[0-6]):(sans|serif):(1\.6|1\.8|2|2\.2):(narrow|standard|wide)$/u;
  const legacy = /^1:(light|sepia|dark|oled):(1[4-9]|2[0-8]):(sans|serif):(1\.6|1\.8|2|2\.2)$/u;
  const currentMatch = current.exec(value);
  if (currentMatch) {
    const [, theme, fontSize, fontFamily, lineHeight, width, textColor] = currentMatch;
    return parseReaderSettings({ theme, fontSize, fontFamily, lineHeight, width, textColor: textColor === "auto" ? "auto" : `#${textColor}` });
  }
  const previousMatch = previous.exec(value);
  if (previousMatch) {
    const [, theme, fontSize, fontFamily, lineHeight, width] = previousMatch;
    return parseReaderSettings({ theme, fontSize, fontFamily, lineHeight, width });
  }
  const legacyMatch = legacy.exec(value);
  if (!legacyMatch) return null;
  const [, theme, fontSize, fontFamily, lineHeight] = legacyMatch;
  return parseReaderSettings({ theme, fontSize, fontFamily, lineHeight });
}

export function serializeReaderSettingsCookie(value: ReaderSettings): string {
  const settings = parseReaderSettings(value);
  const textColor = settings.textColor === "auto" ? "auto" : settings.textColor.slice(1);
  return `3:${settings.theme}:${settings.fontSize}:${settings.fontFamily}:${settings.lineHeight}:${settings.width}:${textColor}`;
}

export const readerThemeTokens = {
  light: { paper: "#FFFFFF", background: "#f1f3f6", text: "#1e293b", surface: "#f8fafc", border: "#cbd5e1", accent: "#1d4ed8", error: "#b91c1c", success: "#047857", colorScheme: "light" },
  sepia: { paper: "#F6F1E7", background: "#eae1d2", text: "#493829", surface: "#f0e7d7", border: "#cbbcaa", accent: "#79502c", error: "#991b1b", success: "#166534", colorScheme: "light" },
  mint: { paper: "#E8F3EE", background: "#d9e8e0", text: "#203b30", surface: "#e1efe8", border: "#aec8b9", accent: "#17604a", error: "#991b1b", success: "#166534", colorScheme: "light" },
  dark: { paper: "#121417", background: "#0b0d10", text: "#e2e5ea", surface: "#1c2026", border: "#3b434f", accent: "#93c5fd", error: "#fca5a5", success: "#6ee7b7", colorScheme: "dark" },
} as const;

export function getReaderStyleVariables(value: ReaderSettings) {
  const settings = parseReaderSettings(value);
  const tokens = readerThemeTokens[settings.theme];
  return {
    "--reader-bg": tokens.background,
    "--reader-paper": tokens.paper,
    "--reader-text": tokens.text,
    "--reader-content-text": settings.textColor === "auto" ? tokens.text : settings.textColor,
    "--reader-surface": tokens.surface,
    "--reader-border": tokens.border,
    "--reader-accent": tokens.accent,
    "--reader-error": tokens.error,
    "--reader-success": tokens.success,
    "--reader-font-size": `${settings.fontSize}px`,
    "--reader-font-family": settings.fontFamily === "serif"
      ? "var(--font-reader-serif), 'Noto Serif', serif" : "var(--font-reader-sans), 'Inter', sans-serif",
    "--reader-line-height": String(settings.lineHeight),
    "--reader-width": readerWidths[settings.width],
    colorScheme: tokens.colorScheme,
  };
}
