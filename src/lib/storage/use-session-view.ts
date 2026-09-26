"use client";

import { useCallback, useState, type SetStateAction } from "react";

/** This hook is used inside the client-mounted workspace (never during SSR). */
export function useSessionView<T>(key: string, fallback: T) {
  const storageKey = `rulequant:view:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved === null ? fallback : JSON.parse(saved) as T;
    } catch { return fallback; }
  });
  const update = useCallback((next: SetStateAction<T>) => {
    setValue((previous) => {
      const resolved = typeof next === "function" ? (next as (old: T) => T)(previous) : next;
      try { sessionStorage.setItem(storageKey, JSON.stringify(resolved)); } catch { /* Remains usable in memory. */ }
      return resolved;
    });
  }, [storageKey]);
  return [value, update] as const;
}
