import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { buildYearUrl, parseDrawHtml } from "@/lib/parsers/draw-html-parser";
import type { DrawRecord } from "@/types/domain";

export type UrlImportSummary = {
  year: number;
  url: string;
  count: number;
  error?: string;
};

export type FetchDrawsFromUrlInput = {
  baseUrl: string;
  fromYear?: number;
  toYear?: number;
  years?: number[];
};

export type FetchDrawsFromUrlResult = {
  records: DrawRecord[];
  years: UrlImportSummary[];
  errors: string[];
  fetchedAt: string;
};

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RuleQuant/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const MAX_SYNC_YEARS = 5;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export function isPrivateNetworkAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) return isPrivateNetworkAddress(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return false;
}

export function validateDrawSourceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("开奖源网址格式无效");
  }
  if (url.protocol !== "https:") throw new Error("开奖源只允许使用 HTTPS");
  if (url.username || url.password) throw new Error("开奖源网址不能包含账号或密码");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateNetworkAddress(hostname)) {
    throw new Error("开奖源不能指向本机或内网地址");
  }
  return url;
}

async function assertPublicDrawSource(value: string) {
  const url = validateDrawSourceUrl(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateNetworkAddress(item.address))) {
    throw new Error("开奖源解析到了本机或内网地址");
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}

export function normalizeYears(input: Pick<FetchDrawsFromUrlInput, "fromYear" | "toYear" | "years">): number[] {
  let normalized: number[];
  if (input.years?.length) {
    normalized = [...new Set(input.years.map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2099))].sort();
  } else {
    const currentYear = new Date().getFullYear();
    const fromYear = Number(input.fromYear || currentYear);
    const toYear = Number(input.toYear || fromYear);
    const start = Math.min(fromYear, toYear);
    const end = Math.max(fromYear, toYear);
    normalized = Array.from({ length: end - start + 1 }, (_, index) => start + index).filter((year) => year >= 2000 && year <= 2099);
  }
  if (!normalized.length) throw new Error("同步年份必须在 2000-2099 之间");
  if (normalized.length > MAX_SYNC_YEARS) throw new Error(`单次最多同步 ${MAX_SYNC_YEARS} 个年份`);
  return normalized;
}

async function fetchWithNodeHttps(urlValue: string, redirectCount = 0): Promise<string> {
  const resolved = await assertPublicDrawSource(urlValue);
  return new Promise((resolve, reject) => {
    const request = https.get(
      resolved.url,
      {
        headers: REQUEST_HEADERS,
        lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error("开奖源重定向次数过多"));
            return;
          }
          const redirectUrl = new URL(response.headers.location, resolved.url).toString();
          resolve(fetchWithNodeHttps(redirectUrl, redirectCount + 1));
          return;
        }
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (declaredLength > MAX_HTML_BYTES) {
          response.resume();
          reject(new Error("开奖源页面超过 5MB，已停止下载"));
          return;
        }
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > MAX_HTML_BYTES) {
            request.destroy(new Error("开奖源页面超过 5MB，已停止下载"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (statusCode >= 200 && statusCode < 300) {
            resolve(body);
            return;
          }
          reject(new Error(`HTTP ${statusCode}`));
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(20000, () => {
      request.destroy(new Error("download timeout"));
    });
  });
}

async function downloadHtml(url: string): Promise<string> {
  return fetchWithNodeHttps(url);
}

export async function fetchDrawsFromUrl(input: FetchDrawsFromUrlInput): Promise<FetchDrawsFromUrlResult> {
  const baseUrl = input.baseUrl.trim();
  if (!baseUrl) {
    return { records: [], years: [], errors: ["missing url"], fetchedAt: new Date().toISOString() };
  }

  const years = normalizeYears(input);
  const records: DrawRecord[] = [];
  const errors: string[] = [];
  const summaries: UrlImportSummary[] = [];

  for (const year of years) {
    const url = buildYearUrl(baseUrl, year);
    try {
      const html = await downloadHtml(url);
      const parsed = parseDrawHtml(html, { year, sourceUrl: url });
      records.push(...parsed.records);
      errors.push(...parsed.errors.map((message) => `${year}: ${message}`));
      summaries.push({ year, url, count: parsed.records.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${year}: ${message}`);
      summaries.push({ year, url, count: 0, error: message });
    }
  }

  const unique = new Map(records.map((record) => [record.issue, record]));
  const sortedRecords = [...unique.values()].sort((a, b) => b.issue.localeCompare(a.issue, "zh-CN", { numeric: true }));

  return {
    records: sortedRecords,
    years: summaries,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}
