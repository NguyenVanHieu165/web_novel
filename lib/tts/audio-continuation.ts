const key = "web-novel:audio-continuation:v1";

export function continueAudioAt(path: string) {
  try { sessionStorage.setItem(key, JSON.stringify({ path, expires: Date.now() + 60_000 })); }
  catch { /* Chapter navigation still works when storage is blocked. */ }
}
export function hasAudioContinuation(path: string, consume = false): boolean {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const matches = typeof value === "object" && value !== null && "path" in value && value.path === path &&
      "expires" in value && typeof value.expires === "number" && value.expires > Date.now();
    if (consume && matches) sessionStorage.removeItem(key);
    return matches;
  } catch { return false; }
}
