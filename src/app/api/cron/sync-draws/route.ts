import { NextResponse } from "next/server";
import {
  configuredDrawSourceUrl,
  hasDrawWriteAuthorization,
  isConfiguredDrawSourceUrl,
  syncDrawsToCloud,
} from "@/lib/server/sync-draws-to-cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function isAuthorized(request: Request, requestedUrl: string) {
  if (process.env.RULEQUANT_PUBLIC_DRAW_SYNC === "true") {
    const usesConfiguredSource = !requestedUrl || isConfiguredDrawSourceUrl(requestedUrl);
    if (usesConfiguredSource) return true;
  }
  const usesConfiguredSource = !requestedUrl || isConfiguredDrawSourceUrl(requestedUrl);
  if (usesConfiguredSource && hasDrawWriteAuthorization(request)) return true;
  return hasDrawWriteAuthorization(request);
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

async function runSync(request: Request) {
  try {
    const url = new URL(request.url);
    const currentYear = new Date().getFullYear();
    const requestedUrl = url.searchParams.get("url") || "";
    if (!isAuthorized(request, requestedUrl)) {
      return NextResponse.json({ ok: false, error: "Unauthorized custom draw source" }, { status: 401, headers: CORS_HEADERS });
    }

    const result = await syncDrawsToCloud({
      baseUrl: requestedUrl || configuredDrawSourceUrl(),
      fromYear: Number(url.searchParams.get("fromYear") || process.env.RULEQUANT_SYNC_FROM_YEAR || currentYear),
      toYear: Number(url.searchParams.get("toYear") || process.env.RULEQUANT_SYNC_TO_YEAR || currentYear),
    });

    return NextResponse.json({
      ok: true,
      latestIssue: result.latestIssue,
      recordCount: result.recordCount,
      errors: result.errors,
      state: result.state,
      years: result.years,
      fetchedAt: result.fetchedAt,
    }, { headers: CORS_HEADERS });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}
