const redirectOrigin = "https://web-novel.invalid";

function hasUnsafeCharacters(value: string): boolean {
  return value.includes("\\") || Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

// Authentication return URLs must stay inside this app, including after URL normalization.
export function safeAuthRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || hasUnsafeCharacters(value)) return "/";

  try {
    if (hasUnsafeCharacters(decodeURIComponent(value))) return "/";
    const parsed = new URL(value, redirectOrigin);
    if (parsed.origin !== redirectOrigin || parsed.pathname.startsWith("//")) return "/";

    let path = parsed.pathname;
    for (let pass = 0; pass < 4; pass += 1) {
      if (hasUnsafeCharacters(path) || path.startsWith("//")) return "/";
      const normalized = new URL(path, redirectOrigin);
      if (normalized.origin !== redirectOrigin || normalized.pathname.startsWith("//")) return "/";
      const decoded = decodeURIComponent(path);
      if (decoded === path) return value;
      path = decoded;
    }

    // Deeply nested escaping is not a normal reading link; use the safe home destination.
    return "/";
  } catch {
    return "/";
  }
}
