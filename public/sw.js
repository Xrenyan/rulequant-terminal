const CLEANUP_VERSION = "20260717-2";
const CACHE_PREFIX = "rulequant-runtime-";
const REFRESH_PARAM = "rq_refresh";

async function removeLegacyCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  );
}

async function getOpenWindows() {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return windows.map((client) => {
    const url = new URL(client.url);
    url.searchParams.set(REFRESH_PARAM, CLEANUP_VERSION);
    return { client, url };
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await removeLegacyCaches();
      await self.clients.claim();
      const windows = await getOpenWindows();
      await self.registration.unregister();
      for (const { client, url } of windows) {
        void client.navigate(url.toString()).catch(() => undefined);
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "RULEQUANT_SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});
