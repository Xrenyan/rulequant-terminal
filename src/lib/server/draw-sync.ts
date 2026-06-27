import https from "node:https";
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

export function normalizeYears(input: Pick<FetchDrawsFromUrlInput, "fromYear" | "toYear" | "years">): number[] {
  if (input.years?.length) {
    return [...new Set(input.years.map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2099))].sort();
  }
  const currentYear = new Date().getFullYear();
  const fromYear = Number(input.fromYear || currentYear);
  const toYear = Number(input.toYear || fromYear);
  const start = Math.min(fromYear, toYear);
  const end = Math.max(fromYear, toYear);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

async function fetchWithNodeHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: REQUEST_HEADERS,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          const statusCode = response.statusCode ?? 0;
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
  try {
    const response = await fetch(url, { cache: "no-store", headers: REQUEST_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (!url.startsWith("https://")) throw error;
    return fetchWithNodeHttps(url);
  }
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
