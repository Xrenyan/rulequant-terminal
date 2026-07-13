const CACHE_NAME = "rulequant-runtime-v4";
const scopeUrl = new URL(self.registration.scope);
const dashboardUrl = new URL("dashboard/", scopeUrl).toString();
const stateUrl = new URL("static-cloud-state.json", scopeUrl).toString();

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const dashboardResponse = await fetch(dashboardUrl, { cache: "reload" });
  if (!dashboardResponse.ok) return;
  await cache.put(dashboardUrl, dashboardResponse.clone());
  const html = await dashboardResponse.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], dashboardUrl))
    .filter((url) => url.origin === scopeUrl.origin && url.pathname.includes("/_next/static/"))
    .map((url) => url.toString());
  await Promise.allSettled([...new Set(assetUrls)].map((url) => cache.add(url)));
  await Promise.allSettled([cache.add(stateUrl)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("rulequant-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl, cacheKey = request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return (await cache.match(cacheKey)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, dashboardUrl));
    return;
  }
  if (url.pathname.endsWith("/static-cloud-state.json")) {
    event.respondWith(networkFirst(request, stateUrl, stateUrl));
    return;
  }
  if (url.pathname.includes("/_next/static/") || /\.(?:css|js|txt|woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
