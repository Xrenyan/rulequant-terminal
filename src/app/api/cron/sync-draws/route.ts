import { NextResponse } from "next/server";
import { loadSharedCloudState, saveSharedCloudStatePatch } from "@/lib/cloud/server-state";
import { fetchDrawsFromUrl } from "@/lib/server/draw-sync";
import { seedConfig, seedRules, seedSampleCases } from "@/lib/data/seed";
import type { OperationLog } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DRAW_SOURCE_URL = "https://thjffv.ag0rkv-4pnok-ljvvrg.xyz:16633/kj/3/2026.html";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function makeLog(input: Omit<OperationLog, "id" | "timestamp">): OperationLog {
  return {
    ...input,
    id: `cloud-log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
}

async function runSync(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const currentYear = new Date().getFullYear();
    const baseUrl = url.searchParams.get("url") || process.env.RULEQUANT_DRAW_SOURCE_URL || DEFAULT_DRAW_SOURCE_URL;
    const fromYear = Number(url.searchParams.get("fromYear") || process.env.RULEQUANT_SYNC_FROM_YEAR || currentYear);
    const toYear = Number(url.searchParams.get("toYear") || process.env.RULEQUANT_SYNC_TO_YEAR || currentYear);

    const result = await fetchDrawsFromUrl({ baseUrl, fromYear, toYear });
    const sorted = [...result.records].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
    const latest = sorted.at(-1);
    const current = await loadSharedCloudState();
    const log = makeLog({
      type: "sync_draws",
      message: `Cloud sync ${sorted.length} draw records, latest issue ${latest?.issue ?? "-"}`,
      issue: latest?.issue,
      dataCount: sorted.length,
      details: {
        sourceUrl: baseUrl,
        years: result.years,
        errors: result.errors,
      },
    });

    const nextLogs = [log, ...current.logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
    const state = await saveSharedCloudStatePatch({
      draws: sorted,
      rules: current.rules.length ? current.rules : seedRules,
      samples: current.samples.length ? current.samples : seedSampleCases,
      config: current.config ?? seedConfig,
      logs: nextLogs,
      backups: current.backups,
    });

    return NextResponse.json({
      ok: true,
      latestIssue: latest?.issue,
      recordCount: sorted.length,
      errors: result.errors,
      state: state.meta,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
