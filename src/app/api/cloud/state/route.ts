import { NextResponse } from "next/server";
import { loadSharedCloudState, saveSharedCloudStatePatch } from "@/lib/cloud/server-state";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function isAuthorized(request: Request) {
  const token = process.env.RULEQUANT_ADMIN_TOKEN;
  if (!token) return true;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const state = await loadSharedCloudState();
    return NextResponse.json(state, {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        draws: [],
        rules: [],
        samples: [],
        logs: [],
        backups: [],
        referenceHistory: [],
        meta: {
          enabled: false,
          source: "disabled",
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies RuleQuantCloudState,
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  try {
    const body = (await request.json()) as Partial<Omit<RuleQuantCloudState, "meta">>;
    const state = await saveSharedCloudStatePatch({
      draws: body.draws,
      rules: body.rules,
      samples: body.samples,
      config: body.config,
      logs: body.logs,
      backups: body.backups,
      referenceHistory: body.referenceHistory,
    });
    return NextResponse.json({ ok: true, state }, { headers: CORS_HEADERS });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: CORS_HEADERS });
  }
}
