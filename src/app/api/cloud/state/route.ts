import { NextResponse } from "next/server";
import { loadSharedCloudState, saveSharedCloudStatePatch } from "@/lib/cloud/server-state";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import { validateRuleQuantConfig } from "@/lib/config/validate-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const MAX_CLOUD_PATCH_BYTES = 15 * 1024 * 1024;

function validateArray(value: unknown, label: string, maxLength: number) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (value.length > maxLength) throw new Error(`${label} exceeds ${maxLength} records`);
}

function isAuthorized(request: Request) {
  const token = process.env.RULEQUANT_ADMIN_TOKEN;
  if (!token) return false;
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
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_CLOUD_PATCH_BYTES) {
      return NextResponse.json({ ok: false, error: "Cloud patch exceeds 15MB" }, { status: 413, headers: CORS_HEADERS });
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_CLOUD_PATCH_BYTES) {
      return NextResponse.json({ ok: false, error: "Cloud patch exceeds 15MB" }, { status: 413, headers: CORS_HEADERS });
    }
    const body = JSON.parse(rawBody) as Partial<Omit<RuleQuantCloudState, "meta">>;
    validateArray(body.draws, "draws", 10_000);
    validateArray(body.rules, "rules", 20_000);
    validateArray(body.samples, "samples", 20_000);
    validateArray(body.logs, "logs", 5_000);
    validateArray(body.backups, "backups", 100);
    validateArray(body.referenceHistory, "referenceHistory", 5_000);
    if (body.config !== undefined) validateRuleQuantConfig(body.config);
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
