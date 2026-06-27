import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parseDrawHtml } from "@/lib/parsers/draw-html-parser";
import type { DrawRecord } from "@/types/domain";

const FIELD_ALIASES: Record<string, keyof DrawRecord> = {
  issue: "issue",
  期号: "issue",
  date: "date",
  日期: "date",
  n1: "n1",
  落1: "n1",
  平1: "n1",
  n2: "n2",
  落2: "n2",
  平2: "n2",
  n3: "n3",
  落3: "n3",
  平3: "n3",
  n4: "n4",
  落4: "n4",
  平4: "n4",
  n5: "n5",
  落5: "n5",
  平5: "n5",
  n6: "n6",
  落6: "n6",
  平6: "n6",
  special: "special",
  特码: "special",
  特号: "special",
  平7: "special",
  落7: "special",
};

type ParseResult = {
  records: DrawRecord[];
  errors: string[];
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return parsed;
}

function normalizeRow(row: Record<string, unknown>, rowIndex: number): { record?: DrawRecord; error?: string } {
  const normalized: Partial<DrawRecord> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const key = FIELD_ALIASES[rawKey.trim()];
    if (!key) continue;
    if (key === "issue" || key === "date") {
      normalized[key] = String(value ?? "").trim();
    } else {
      normalized[key] = toNumber(value) as never;
    }
  }

  const required: Array<keyof DrawRecord> = ["issue", "n1", "n2", "n3", "n4", "n5", "n6", "special"];
  const missing = required.filter((key) => normalized[key] === undefined || normalized[key] === "");
  if (missing.length) return { error: `第 ${rowIndex + 1} 行缺少字段：${missing.join(", ")}` };

  const numbers = [normalized.n1, normalized.n2, normalized.n3, normalized.n4, normalized.n5, normalized.n6, normalized.special] as number[];
  const invalid = numbers.find((number) => !Number.isInteger(number) || number < 1 || number > 49);
  if (invalid !== undefined) return { error: `第 ${rowIndex + 1} 行号码超出 1-49：${invalid}` };

  return { record: normalized as DrawRecord };
}

function parseRows(rows: Array<Record<string, unknown>>): ParseResult {
  const records: DrawRecord[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const result = normalizeRow(row, index);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    if (result.record) {
      if (seen.has(result.record.issue)) {
        errors.push(`重复期号：${result.record.issue}`);
      }
      seen.add(result.record.issue);
      records.push(result.record);
    }
  });

  return { records, errors };
}

function parseNoHeader(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = lines.map((line) => {
    const parts = line.split(/[\s,，\t|]+/).filter(Boolean);
    const [issue, n1, n2, n3, n4, n5, n6, special] = parts;
    return { issue, n1, n2, n3, n4, n5, n6, special };
  });
  return parseRows(rows);
}

export function parseDrawText(text: string): ParseResult {
  if (/<div\b[^>]*\bkj-tit\b/i.test(text) || /<html\b/i.test(text)) {
    const htmlResult = parseDrawHtml(text);
    if (htmlResult.records.length || htmlResult.errors.length) return htmlResult;
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  const headerResult = parseRows(parsed.data);
  if (headerResult.records.length || headerResult.errors.length) return headerResult;
  return parseNoHeader(text);
}

export async function parseDrawFile(file: File): Promise<ParseResult> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "html" || ext === "htm") {
    return parseDrawHtml(await file.text(), { sourceUrl: file.name });
  }
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return parseRows(rows);
  }
  return parseDrawText(await file.text());
}
