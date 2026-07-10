import type { RuleRecord } from "@/types/domain";

export const RULE_LIBRARY_SNAPSHOT_KEY = "rulequant:rule-library:v1";
export const RULE_LIBRARY_CACHE_NAME = "rulequant-rule-library-backup-v1";

const RULE_LIBRARY_CACHE_PATH = "/__rulequant__/rule-library-backup-v1.json";
const MAX_LOCAL_SNAPSHOT_BYTES = 1_500_000;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem"> & Partial<Pick<Storage, "removeItem">>;

type RuleLibrarySnapshot = {
  version: 1;
  savedAt: string;
  rules: RuleRecord[];
};

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRuleRecord(value: unknown): value is RuleRecord {
  if (!value || typeof value !== "object") return false;
  const rule = value as Partial<RuleRecord>;
  return Boolean(
    typeof rule.id === "string" &&
    rule.id.trim() &&
    typeof rule.formula === "string" &&
    rule.formula.trim() &&
    typeof rule.name === "string",
  );
}

function timestampValue(value?: string) {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
}

function buildSnapshot(rules: RuleRecord[]): RuleLibrarySnapshot {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    rules,
  };
}

function parseSnapshot(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const snapshot = JSON.parse(raw) as Partial<RuleLibrarySnapshot>;
    if (snapshot.version !== 1 || !Array.isArray(snapshot.rules)) return [];
    return snapshot.rules.filter(isRuleRecord);
  } catch {
    return [];
  }
}

function cacheRequest() {
  if (typeof window === "undefined") return undefined;
  return new Request(new URL(RULE_LIBRARY_CACHE_PATH, window.location.origin));
}

export function mergeRuleSnapshots(primaryRules: RuleRecord[], backupRules: RuleRecord[]) {
  const merged = new Map(primaryRules.map((rule) => [rule.id, rule]));

  backupRules.forEach((backupRule) => {
    const primaryRule = merged.get(backupRule.id);
    if (!primaryRule || timestampValue(backupRule.updatedAt) > timestampValue(primaryRule.updatedAt)) {
      merged.set(backupRule.id, backupRule);
    }
  });

  return [...merged.values()];
}

export function readRuleLibrarySnapshot(storage: ReadableStorage | undefined = browserStorage()) {
  if (!storage) return [];
  try {
    return parseSnapshot(storage.getItem(RULE_LIBRARY_SNAPSHOT_KEY));
  } catch {
    return [];
  }
}

export function writeRuleLibrarySnapshot(rules: RuleRecord[], storage: WritableStorage | undefined = browserStorage()) {
  if (!storage) return false;
  try {
    const payload = JSON.stringify(buildSnapshot(rules));
    if (payload.length > MAX_LOCAL_SNAPSHOT_BYTES) {
      storage.removeItem?.(RULE_LIBRARY_SNAPSHOT_KEY);
      return false;
    }
    storage.setItem(RULE_LIBRARY_SNAPSHOT_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

export async function readRuleLibraryCacheSnapshot() {
  if (typeof window === "undefined" || !("caches" in window)) return [];
  try {
    const request = cacheRequest();
    if (!request) return [];
    const cache = await window.caches.open(RULE_LIBRARY_CACHE_NAME);
    const response = await cache.match(request);
    return parseSnapshot(await response?.text());
  } catch {
    return [];
  }
}

export async function writeRuleLibraryCacheSnapshot(rules: RuleRecord[]) {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  try {
    const request = cacheRequest();
    if (!request) return false;
    const cache = await window.caches.open(RULE_LIBRARY_CACHE_NAME);
    await cache.put(request, new Response(JSON.stringify(buildSnapshot(rules)), {
      headers: { "Content-Type": "application/json;charset=utf-8" },
    }));
    return true;
  } catch {
    return false;
  }
}
