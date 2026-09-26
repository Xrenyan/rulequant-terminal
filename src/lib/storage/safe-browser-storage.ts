/** Optional browser metadata must never interrupt calculations or accepting a valid draw. */
export function readBrowserLocalStorage(key: string, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  try {
    // Accessing localStorage itself can throw SecurityError, before getItem is called.
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** False means the caller must not claim persistence succeeded. The in-memory action can continue. */
export function writeBrowserLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
