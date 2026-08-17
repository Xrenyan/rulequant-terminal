export function uniqueResolvedUrls(urls: string[], baseUrl: string) {
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const value of urls) {
    if (!value) continue;
    const url = new URL(value, baseUrl).href;
    if (seen.has(url)) continue;
    seen.add(url);
    resolved.push(url);
  }

  return resolved;
}

type JsonCacheEntry = {
  expiresAt: number;
  value?: unknown;
  request?: Promise<unknown>;
};

const jsonCache = new Map<string, JsonCacheEntry>();

export async function fetchJsonWithSessionCache<T>(
  input: string,
  options: {
    baseUrl: string;
    timeoutMs?: number;
    ttlMs?: number;
    force?: boolean;
    fetcher?: typeof fetch;
  },
): Promise<T> {
  const url = new URL(input, options.baseUrl);
  const cacheKey = url.href;
  const now = Date.now();
  const cached = jsonCache.get(cacheKey);

  if (!options.force && cached?.request) return cached.request as Promise<T>;
  if (!options.force && cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value as T;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  const fetcher = options.fetcher ?? fetch;
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("t", String(now));
  const request = (async () => {
    try {
      const response = await fetcher(requestUrl, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.json() as T;
      jsonCache.set(cacheKey, { value, expiresAt: Date.now() + (options.ttlMs ?? 30_000) });
      return value;
    } catch (error) {
      jsonCache.delete(cacheKey);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  jsonCache.set(cacheKey, { request, expiresAt: 0 });
  return request;
}

export function clearSessionJsonCache() {
  jsonCache.clear();
}
