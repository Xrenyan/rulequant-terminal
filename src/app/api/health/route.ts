import { loadSharedCloudState } from "@/lib/cloud/server-state";
import { summarizeDraws } from "@/lib/cloud/cloud-state";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const state = await loadSharedCloudState();
    const summary = summarizeDraws(state.draws);
    return Response.json({
      ok: true,
      mode: state.meta.source,
      updatedAt: state.meta.updatedAt,
      latestIssue: state.meta.latestIssue ?? summary.latestIssue,
      recordCount: state.meta.recordCount ?? summary.recordCount,
      ruleCount: state.rules.length,
    }, { headers: NO_STORE_HEADERS });
  } catch {
    return Response.json({
      ok: false,
      mode: "unavailable",
      error: "健康状态暂时不可用",
    }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
