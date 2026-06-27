import { NextResponse } from "next/server";
import { loadCloudState, saveCloudStatePatch } from "@/lib/cloud/server-db";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const token = process.env.RULEQUANT_ADMIN_TOKEN;
  if (!token) return true;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

export async function GET() {
  try {
    const state = await loadCloudState();
    return NextResponse.json(state, {
      headers: {
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
        meta: {
          enabled: false,
          source: "disabled",
          message: error instanceof Error ? error.message : String(error),
        },
      } satisfies RuleQuantCloudState,
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<Omit<RuleQuantCloudState, "meta">>;
    const state = await saveCloudStatePatch({
      draws: body.draws,
      rules: body.rules,
      samples: body.samples,
      config: body.config,
      logs: body.logs,
      backups: body.backups,
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
