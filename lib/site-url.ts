const FALLBACK_SITE_URL = "https://web-novel-ete3.vercel.app";

export function getSiteUrl(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.origin;
      }
    } catch {
      // Invalid deployment values fall back to the canonical production URL.
    }
  }

  return FALLBACK_SITE_URL;
}
