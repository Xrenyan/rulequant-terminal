import type { OperationLog } from "@/types/domain";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import { EMPTY_CLOUD_STATE } from "@/lib/cloud/cloud-state";
import { isCloudDatabaseConfigured, loadCloudState, saveCloudStatePatch } from "@/lib/cloud/server-db";
import { isGitHubStateConfigured, loadGitHubState, saveGitHubStatePatch } from "@/lib/cloud/github-state";

export function isCloudStateConfigured() {
  return isCloudDatabaseConfigured() || isGitHubStateConfigured();
}

export async function loadSharedCloudState(): Promise<RuleQuantCloudState> {
  if (isCloudDatabaseConfigured()) return loadCloudState();
  if (isGitHubStateConfigured()) return loadGitHubState();
  return {
    ...EMPTY_CLOUD_STATE,
    meta: {
      enabled: false,
      source: "disabled",
      message: "No cloud state backend configured",
    },
  };
}

export async function saveSharedCloudStatePatch(patch: Partial<Omit<RuleQuantCloudState, "meta">>) {
  if (isCloudDatabaseConfigured()) return saveCloudStatePatch(patch);
  if (isGitHubStateConfigured()) return saveGitHubStatePatch(patch);
  return loadSharedCloudState();
}

export async function appendSharedCloudLog(log: OperationLog) {
  const current = await loadSharedCloudState();
  const logs = [log, ...current.logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
  return saveSharedCloudStatePatch({ logs });
}
