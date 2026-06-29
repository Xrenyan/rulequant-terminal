import { loadSharedCloudState, saveSharedCloudStatePatch } from "@/lib/cloud/server-state";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import { seedConfig, seedRules, seedSampleCases } from "@/lib/data/seed";
import { fetchDrawsFromUrl, type FetchDrawsFromUrlInput, type FetchDrawsFromUrlResult } from "@/lib/server/draw-sync";
import type { DrawRecord, OperationLog } from "@/types/domain";

export const DEFAULT_DRAW_SOURCE_URL = "https://thjffv.ag0rkv-4pnok-ljvvrg.xyz:16633/kj/3/2026.html";

type SyncDrawsToCloudResult = FetchDrawsFromUrlResult & {
  ok: boolean;
  latestIssue?: string;
  recordCount: number;
  state?: RuleQuantCloudState["meta"];
};

export function configuredDrawSourceUrl() {
  return process.env.RULEQUANT_DRAW_SOURCE_URL || DEFAULT_DRAW_SOURCE_URL;
}

export function normalizeDrawSourceUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function isConfiguredDrawSourceUrl(value: string) {
  return normalizeDrawSourceUrl(value) === normalizeDrawSourceUrl(configuredDrawSourceUrl());
}

export function hasDrawWriteAuthorization(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.RULEQUANT_ADMIN_TOKEN;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isManualDraw(record: Pick<DrawRecord, "sourceUrl" | "rawAttributes">) {
  return record.sourceUrl === "manual://user-input" || record.rawAttributes?.sourceType === "manual";
}

function sortDraws(draws: DrawRecord[]) {
  return [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}

function makeLog(input: Omit<OperationLog, "id" | "timestamp">): OperationLog {
  return {
    ...input,
    id: `cloud-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
}

export async function syncDrawsToCloud(input: FetchDrawsFromUrlInput): Promise<SyncDrawsToCloudResult> {
  const result = await fetchDrawsFromUrl(input);
  const sorted = sortDraws(result.records);
  if (!sorted.length) {
    throw new Error(`Configured draw source returned no valid records. sourceUrl=${input.baseUrl}; errors=${result.errors.join("; ") || "none"}`);
  }

  const latest = sorted.at(-1);
  const current = await loadSharedCloudState();
  const mergedDraws = new Map(sorted.map((record) => [record.issue, record]));
  current.draws.filter(isManualDraw).forEach((record) => mergedDraws.set(record.issue, record));
  const nextDraws = sortDraws([...mergedDraws.values()]);
  const log = makeLog({
    type: "sync_draws",
    message: `Cloud sync draw source ${sorted.length} records, latest issue ${latest?.issue ?? "-"}`,
    issue: latest?.issue,
    dataCount: nextDraws.length,
    details: {
      sourceUrl: input.baseUrl,
      years: result.years,
      errors: result.errors,
    },
  });
  const nextLogs = [log, ...current.logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
  const state = await saveSharedCloudStatePatch({
    draws: nextDraws,
    rules: current.rules.length ? current.rules : seedRules,
    samples: current.samples.length ? current.samples : seedSampleCases,
    config: current.config ?? seedConfig,
    logs: nextLogs,
    backups: current.backups,
    referenceHistory: current.referenceHistory,
  });

  return {
    ...result,
    ok: true,
    latestIssue: latest?.issue,
    recordCount: nextDraws.length,
    state: state.meta,
  };
}
