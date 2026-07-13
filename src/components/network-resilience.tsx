"use client";

import { useEffect } from "react";

export function NetworkResilience() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const workerUrl = `${basePath}/sw.js`;
    const scope = `${basePath || ""}/`;
    void navigator.serviceWorker.register(workerUrl, { scope }).catch(() => {
      // The app remains fully usable without offline caching.
    });
  }, []);

  return null;
}
