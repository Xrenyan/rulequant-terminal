import fs from "node:fs";
import path from "node:path";

const endpoint = process.env.RULEQUANT_CLOUD_STATE_URL || "https://rulequant-terminal.vercel.app/api/cloud/state";
const drawImportEndpoint = process.env.RULEQUANT_DRAW_IMPORT_URL || "https://rulequant-terminal.vercel.app/api/import-draws-from-url";
const drawSourceUrl = process.env.RULEQUANT_DRAW_SOURCE_URL || "https://thjffv.ag0rkv-4pnok-ljvvrg.xyz:16633/kj/3/2026.html";
const root = process.cwd();

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function issueValue(issue) {
  const value = Number(String(issue ?? "").replace(/\D/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function sortDraws(draws) {
  return [...draws].sort((a, b) => issueValue(a.issue) - issueValue(b.issue));
}

function latestIssue(draws) {
  return sortDraws(draws).at(-1)?.issue ?? "";
}

function mergeByKey(localItems, remoteItems, getKey) {
  const merged = new Map();
  for (const item of localItems) {
    const key = getKey(item);
    if (key) merged.set(key, item);
  }
  for (const item of remoteItems) {
    const key = getKey(item);
    if (key) merged.set(key, item);
  }
  return [...merged.values()];
}

async function main() {
  const staticStatePath = path.join(root, "public", "static-cloud-state.json");
  const localState = readJsonIfExists(staticStatePath, {});
  const localDraws = Array.isArray(localState.draws)
    ? localState.draws
    : readJsonIfExists(path.join(root, "data", "sample-draws.json"), []);
  const localRules = Array.isArray(localState.rules)
    ? localState.rules
    : readJsonIfExists(path.join(root, "data", "sample-rules.json"), []);
  let state = localState;
  try {
    const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh static data: ${response.status} ${response.statusText}`);
    }

    const cloudState = await response.json();
    if (!Array.isArray(cloudState.draws) || !Array.isArray(cloudState.rules)) {
      throw new Error("Cloud state response does not include draws/rules arrays.");
    }
    state = cloudState;
  } catch (error) {
    if (!Array.isArray(localDraws) || !Array.isArray(localRules) || localDraws.length === 0 || localRules.length === 0) {
      throw error;
    }
    console.warn(`Cloud state refresh skipped; using local static data: ${error instanceof Error ? error.message : String(error)}`);
    state = {
      ...localState,
      draws: localDraws,
      rules: localRules,
    };
  }
  const cloudDraws = Array.isArray(state.draws) ? state.draws : [];

  let sourceDraws = [];
  let sourceFetchedAt = "";
  try {
    const drawResponse = await fetch(`${drawImportEndpoint}${drawImportEndpoint.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: drawSourceUrl, fromYear: 2026, toYear: 2026 }),
      cache: "no-store",
    });
    if (drawResponse.ok) {
      const imported = await drawResponse.json();
      if (Array.isArray(imported.records)) {
        sourceDraws = imported.records;
        sourceFetchedAt = imported.fetchedAt ?? "";
      }
    } else {
      console.warn(`Draw source refresh skipped: ${drawResponse.status} ${drawResponse.statusText}`);
    }
  } catch (error) {
    console.warn(`Draw source refresh skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  const mergedDraws = sortDraws(
    mergeByKey(
      mergeByKey(localDraws, cloudDraws, (draw) => String(draw.issue ?? "")),
      sourceDraws,
      (draw) => String(draw.issue ?? ""),
    ),
  );
  const mergedRules = mergeByKey(localRules, state.rules, (rule) => {
    if (rule.id) return `id:${rule.id}`;
    return `signature:${rule.type ?? ""}|${rule.target ?? ""}|${rule.orderType ?? ""}|${rule.expression ?? ""}|${rule.normalizeMode ?? ""}`;
  });
  const localLatest = latestIssue(localDraws);
  const cloudLatest = latestIssue(cloudDraws);
  const sourceLatest = latestIssue(sourceDraws);
  const mergedLatest = latestIssue(mergedDraws);
  const localIsNewest =
    issueValue(localLatest) >= issueValue(cloudLatest) &&
    issueValue(localLatest) >= issueValue(sourceLatest);

  const nextState = {
    ...localState,
    ...state,
    draws: mergedDraws,
    rules: mergedRules,
    samples: Array.isArray(state.samples) ? state.samples : (localState.samples ?? []),
    logs: Array.isArray(state.logs) ? state.logs : (localState.logs ?? []),
    backups: Array.isArray(state.backups) ? state.backups : (localState.backups ?? []),
    referenceHistory: Array.isArray(state.referenceHistory) ? state.referenceHistory : (localState.referenceHistory ?? []),
    meta: {
      ...(localState.meta ?? {}),
      ...(state.meta ?? {}),
      latestIssue: mergedLatest,
      recordCount: mergedDraws.length,
      updatedAt: localIsNewest
        ? (localState.meta?.updatedAt ?? state.meta?.updatedAt)
        : (sourceFetchedAt || state.meta?.updatedAt || localState.meta?.updatedAt),
      message: "Static data refreshed without rolling back newer local draws",
    },
  };

  fs.writeFileSync(path.join(root, "data", "sample-draws.json"), `${JSON.stringify(mergedDraws, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(root, "data", "sample-rules.json"), `${JSON.stringify(mergedRules, null, 2)}\n`, "utf8");
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  fs.writeFileSync(staticStatePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        cloudLatestIssue: cloudLatest,
        localLatestIssue: localLatest,
        sourceLatestIssue: sourceLatest,
        latestIssue: mergedLatest,
        draws: mergedDraws.length,
        rules: mergedRules.length,
        updatedAt: nextState.meta?.updatedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
