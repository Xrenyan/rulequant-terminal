"use client";

import { useEffect } from "react";

const CACHE_CLEANUP_VERSION = "20260717-2";
const CACHE_CLEANUP_KEY = "rulequant:cache-cleanup-version";
const REFRESH_PARAM = "rq_refresh";

async function removeLegacyCaches() {
  if (!("caches" in window)) return;
  const keys = await window.caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("rulequant-runtime-"))
      .map((key) => window.caches.delete(key)),
  );
}

async function unregisterAppWorkers(scopePath: string) {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => new URL(registration.scope).pathname.startsWith(scopePath))
      .map((registration) => registration.unregister()),
  );
}

function removeRefreshMarker() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(REFRESH_PARAM)) return;
  url.searchParams.delete(REFRESH_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function NetworkResilience() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const workerUrl = `${basePath}/sw.js?v=${CACHE_CLEANUP_VERSION}`;
    const scope = `${basePath || ""}/`;
    const scopePath = new URL(scope, window.location.origin).pathname;

    const retireLegacyWorker = async () => {
      const refreshVersion = new URL(window.location.href).searchParams.get(REFRESH_PARAM);
      const cleanupComplete = window.localStorage.getItem(CACHE_CLEANUP_KEY) === CACHE_CLEANUP_VERSION;

      if (refreshVersion === CACHE_CLEANUP_VERSION || cleanupComplete) {
        await unregisterAppWorkers(scopePath);
        await removeLegacyCaches();
        window.localStorage.setItem(CACHE_CLEANUP_KEY, CACHE_CLEANUP_VERSION);
        removeRefreshMarker();
        return;
      }

      const registration = await navigator.serviceWorker.register(workerUrl, {
        scope,
        updateViaCache: "none",
      });
      registration.waiting?.postMessage({ type: "RULEQUANT_SKIP_WAITING" });
      await registration.update();
    };

    void retireLegacyWorker().catch(() => {
      // Network failure does not block the app; the next visit retries the cleanup.
    });
  }, []);

  return null;
}
