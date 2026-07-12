"use client";

import { create } from "zustand";
import { runRuleCalculation } from "@/lib/rule-engine/rule-engine";
import { defaultConfig } from "@/lib/config/default-config";
import { validateRuleQuantConfig } from "@/lib/config/validate-config";
import { seedConfig, seedDraws, seedRules, seedSampleCases } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { loadPersistedState, persistAll, persistReferenceHistoryAndLogs } from "@/lib/storage/db";
import { trimReferenceHistory } from "@/lib/reference-history/reference-history";
import {
  addRuleToLibrary as addRuleDraftToLibrary,
  addRulesToLibrary as addRuleDraftsToLibrary,
  normalizeRuleDraft,
  type AddRuleToLibraryResult,
  type AddRulesToLibraryResult,
  type RuleLibraryDraft,
} from "@/lib/rules/rule-library";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import type { DrawRecord, OperationLog, ReferenceHistoryItem, RuleLibraryBackup, RuleQuantConfig, RuleRecord, RuleSourceType, SampleCase } from "@/types/domain";

const REMOTE_CLOUD_STATE_ENDPOINT = "https://rulequant-terminal.vercel.app/api/cloud/state";

type RuleQuantState = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  samples: SampleCase[];
  operationLogs: OperationLog[];
  ruleBackups: RuleLibraryBackup[];
  referenceHistory: ReferenceHistoryItem[];
  config: RuleQuantConfig;
  cloudStateMeta?: RuleQuantCloudState["meta"];
  cloudPublishStatus: "idle" | "local_only" | "publishing" | "published" | "failed";
  cloudPublishMessage: string;
  lastCloudPublishAt?: string;
  hasHydrated: boolean;
  selectedRuleId: string;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  publishCloudState: (reason?: string) => Promise<void>;
  resetSeed: () => Promise<void>;
  resetRules: () => Promise<void>;
  importDraws: (records: DrawRecord[]) => Promise<void>;
  replaceDraws: (records: DrawRecord[]) => Promise<void>;
  deleteDraw: (issue: string) => Promise<void>;
  importRules: (records: RuleRecord[]) => Promise<void>;
  addRuleToLibrary: (draft: RuleLibraryDraft, reason?: string) => Promise<AddRuleToLibraryResult>;
  addRulesToLibrary: (drafts: RuleLibraryDraft[], reason?: string) => Promise<AddRulesToLibraryResult>;
  appendRules: (records: RuleRecord[], reason?: string) => Promise<AddRulesToLibraryResult>;
  restoreLastRuleBackup: () => Promise<void>;
  addOperationLog: (log: Omit<OperationLog, "id" | "timestamp"> & { timestamp?: string }) => Promise<void>;
  saveReferenceHistory: (record: ReferenceHistoryItem) => Promise<void>;
  deleteReferenceHistory: (recordId: string) => Promise<void>;
  clearReferenceHistory: () => Promise<void>;
  upsertRule: (rule: RuleRecord) => Promise<AddRuleToLibraryResult>;
  duplicateRule: (ruleId: string) => Promise<void>;
  deleteRule: (ruleId: string) => Promise<void>;
  toggleRule: (ruleId: string) => Promise<void>;
  toggleReferenceParticipation: (ruleId: string) => Promise<void>;
  confirmRule: (ruleId: string) => Promise<void>;
  setSelectedRule: (ruleId: string) => void;
  upsertSample: (sample: SampleCase) => Promise<void>;
  updateConfig: (config: RuleQuantConfig) => Promise<void>;
};

function sortDraws(draws: DrawRecord[]) {
  return [...draws].sort((a, b) => {
    const aNumber = /^\d+$/.test(a.issue) ? Number(a.issue) : undefined;
    const bNumber = /^\d+$/.test(b.issue) ? Number(b.issue) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) return aNumber - bNumber;
    if (aNumber !== undefined) return 1;
    if (bNumber !== undefined) return -1;
    return a.issue.localeCompare(b.issue, "zh-CN", { numeric: true });
  });
}

function makeLog(input: Omit<OperationLog, "id" | "timestamp"> & { timestamp?: string }): OperationLog {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    ...input,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
  };
}

function makeRuleBackup(rules: RuleRecord[], reason: string): RuleLibraryBackup {
  return {
    id: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    reason,
    rules: rules.map((rule) => ({ ...rule })),
  };
}

function trimLogs(logs: OperationLog[]) {
  return [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
}

function trimBackups(backups: RuleLibraryBackup[]) {
  return [...backups].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
}

function isManualDraw(record: Pick<DrawRecord, "sourceUrl" | "rawAttributes">) {
  return record.sourceUrl === "manual://user-input" || record.rawAttributes?.sourceType === "manual";
}

function mergeManualDraws(baseDraws: DrawRecord[], localDraws: DrawRecord[]) {
  const merged = new Map(baseDraws.map((draw) => [draw.issue, draw]));
  localDraws.filter(isManualDraw).forEach((draw) => merged.set(draw.issue, draw));
  return [...merged.values()];
}

const userCreatedRuleSources = new Set<RuleSourceType>(["manual", "txt_import", "system_recommended", "copied"]);
const SELECTED_RULE_STORAGE_KEY = "rulequant:selectedRuleId";

function readSelectedRuleId() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SELECTED_RULE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSelectedRuleId(ruleId: string) {
  if (typeof window === "undefined") return;
  try {
    if (ruleId) window.localStorage.setItem(SELECTED_RULE_STORAGE_KEY, ruleId);
    else window.localStorage.removeItem(SELECTED_RULE_STORAGE_KEY);
  } catch {
    // IndexedDB remains the primary rule store when localStorage is unavailable.
  }
}

function timestampValue(value?: string) {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : 0;
}

function isUserCreatedRule(rule: Pick<RuleRecord, "id" | "sourceType">) {
  if (userCreatedRuleSources.has(rule.sourceType ?? "user_provided")) return true;
  return !seedRules.some((seedRule) => seedRule.id === rule.id);
}

function shouldPreferLocalRule(localRule: RuleRecord, baseRule: RuleRecord) {
  if (isUserCreatedRule(localRule) && timestampValue(localRule.updatedAt) >= timestampValue(baseRule.updatedAt)) return true;
  return timestampValue(localRule.updatedAt) > timestampValue(baseRule.updatedAt);
}

function mergeLocalRules(baseRules: RuleRecord[], localRules: RuleRecord[]) {
  const merged = new Map(baseRules.map((rule) => [rule.id, rule]));
  localRules.forEach((localRule) => {
    const current = merged.get(localRule.id);
    if (!current) {
      if (isUserCreatedRule(localRule)) merged.set(localRule.id, localRule);
      return;
    }
    if (shouldPreferLocalRule(localRule, current)) merged.set(localRule.id, localRule);
  });
  return [...merged.values()];
}

function normalizeRuleForLibrary(rule: RuleRecord, fallback?: RuleRecord): RuleRecord {
  const normalized = {
    ...fallback,
    ...rule,
    sourceType: rule.sourceType ?? fallback?.sourceType ?? "user_provided",
    manuallyConfirmed: rule.manuallyConfirmed ?? fallback?.manuallyConfirmed ?? false,
    participatesInReference: rule.participatesInReference ?? fallback?.participatesInReference ?? true,
    positionPattern: rule.positionPattern ?? fallback?.positionPattern ?? [],
    anchorIssue: rule.anchorIssue ?? fallback?.anchorIssue,
    anchorPatternIndex: rule.anchorPatternIndex ?? fallback?.anchorPatternIndex,
    positionMeaning: rule.positionMeaning ?? fallback?.positionMeaning,
  };
  return normalizeRuleDraft(normalized, { existingRule: fallback, forceNewId: false, now: normalized.updatedAt });
}

function normalizeConfigForCurrentRules(config?: RuleQuantConfig): RuleQuantConfig {
  const normalized = {
    ...defaultConfig,
    ...(config ?? {}),
    colorValues: defaultConfig.colorValues,
    elementTable: defaultConfig.elementTable,
    elementValues: defaultConfig.elementValues,
  };
  try {
    return validateRuleQuantConfig(normalized);
  } catch {
    return defaultConfig;
  }
}

function mergeRulesWithSeedRules(rules: RuleRecord[]) {
  const seedById = new Map(seedRules.map((rule) => [rule.id, rule]));
  const existing = new Set(rules.map((rule) => rule.id));
  const missingSeedRules = seedRules.filter((rule) => !existing.has(rule.id));
  return [...rules, ...missingSeedRules].map((rule) => normalizeRuleForLibrary(rule, seedById.get(rule.id)));
}

type PersistedRuleQuantState = Awaited<ReturnType<typeof loadPersistedState>>;

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function buildHydratedState(input: {
  persisted: PersistedRuleQuantState;
  cloud?: RuleQuantCloudState | null;
  current: Pick<RuleQuantState, "draws" | "rules" | "selectedRuleId">;
  preferredSelectedRuleId?: string;
}) {
  const cloudDraws = input.cloud?.draws ?? [];
  const cloudRules = input.cloud?.rules ?? [];
  const cloudSamples = input.cloud?.samples ?? [];
  const cloudLogs = input.cloud?.logs ?? [];
  const cloudBackups = input.cloud?.backups ?? [];
  const cloudReferenceHistory = input.cloud?.referenceHistory ?? [];
  const baseDraws = cloudDraws.length ? cloudDraws : input.persisted.draws.length ? input.persisted.draws : seedDraws;
  const localDraws = [...(input.persisted.draws ?? []), ...input.current.draws.filter(isManualDraw)];
  const nextDraws = mergeManualDraws(baseDraws, localDraws);
  const baseRules = cloudRules.length ? cloudRules : input.persisted.rules.length ? input.persisted.rules : seedRules;
  const localRules = [...(input.persisted.rules ?? []), ...input.current.rules.filter(isUserCreatedRule)];
  const nextRules = mergeRulesWithSeedRules(mergeLocalRules(baseRules, localRules));
  const nextSamples = cloudSamples.length ? cloudSamples : input.persisted.samples.length ? input.persisted.samples : seedSampleCases;
  const nextConfig = normalizeConfigForCurrentRules(input.cloud?.config ?? input.persisted.config ?? seedConfig);
  const nextLogs = trimLogs(uniqueById([...cloudLogs, ...(input.persisted.logs ?? [])]));
  const nextBackups = trimBackups(uniqueById([...cloudBackups, ...(input.persisted.backups ?? [])]));
  const nextReferenceHistory = trimReferenceHistory(uniqueById([...cloudReferenceHistory, ...(input.persisted.referenceHistory ?? [])]));
  const requestedRuleId = input.preferredSelectedRuleId || input.current.selectedRuleId;
  const selectedRuleId = nextRules.some((rule) => rule.id === requestedRuleId) ? requestedRuleId : nextRules[0]?.id ?? "";

  return {
    draws: sortDraws(nextDraws),
    rules: nextRules,
    samples: nextSamples,
    operationLogs: nextLogs,
    ruleBackups: nextBackups,
    referenceHistory: nextReferenceHistory,
    config: nextConfig,
    cloudStateMeta: input.cloud?.meta,
    selectedRuleId,
    hasHydrated: true,
  };
}

async function loadCloudStateFromApi(): Promise<RuleQuantCloudState | null> {
  if (typeof window === "undefined") return null;

  const staticBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
  const isGithubPagesHost = window.location.hostname.endsWith("github.io") || isStaticExport;
  const endpoints = (
    isGithubPagesHost
      ? [`${staticBasePath}/static-cloud-state.json`]
      : [
          "/api/cloud/state",
          REMOTE_CLOUD_STATE_ENDPOINT,
          `${staticBasePath}/static-cloud-state.json`,
          "/static-cloud-state.json",
          "../static-cloud-state.json",
        ]
  ).filter((endpoint, index, list) => endpoint && list.indexOf(endpoint) === index);

  const states = await Promise.all(endpoints.map(async (endpoint) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 1500);
    try {
      const url = endpoint.includes("?") ? `${endpoint}&t=${Date.now()}` : `${endpoint}?t=${Date.now()}`;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return null;
      const state = (await response.json()) as RuleQuantCloudState;
      return state.meta?.enabled ? state : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }));

  return states.filter((state): state is RuleQuantCloudState => Boolean(state)).sort((a, b) => {
    const latestIssue = (state: RuleQuantCloudState) => Math.max(
      /^\d+$/.test(state.meta.latestIssue ?? "") ? Number(state.meta.latestIssue) : 0,
      ...((state.draws ?? []).map((draw) => (/^\d+$/.test(draw.issue) ? Number(draw.issue) : 0)).filter(Number.isFinite)),
    );
    return latestIssue(b) - latestIssue(a);
  })[0] ?? null;
}

export const useRuleQuantStore = create<RuleQuantState>((set, get) => ({
  draws: seedDraws,
  rules: mergeRulesWithSeedRules(seedRules),
  samples: seedSampleCases,
  operationLogs: [],
  ruleBackups: [],
  referenceHistory: [],
  config: seedConfig,
  cloudStateMeta: undefined,
  cloudPublishStatus: "idle",
  cloudPublishMessage: "",
  lastCloudPublishAt: undefined,
  hasHydrated: false,
  selectedRuleId: seedRules[0]?.id ?? "",
  hydrate: async () => {
    const persisted = await loadPersistedState();
    const preferredSelectedRuleId = readSelectedRuleId();
    set(buildHydratedState({ persisted, current: get(), preferredSelectedRuleId }));

    // Network discovery must never block the first usable screen. Reconcile a
    // fresher cloud snapshot after local data is already interactive.
    const cloud = await loadCloudStateFromApi();
    if (cloud) set(buildHydratedState({ persisted, cloud, current: get(), preferredSelectedRuleId: readSelectedRuleId() }));
  },
  persist: async () => {
    const state = get();
    await persistAll({
      draws: state.draws,
      rules: state.rules,
      samples: state.samples,
      config: state.config,
      logs: state.operationLogs,
      backups: state.ruleBackups,
      referenceHistory: state.referenceHistory,
    });
    if (typeof window !== "undefined") {
      const token = window.localStorage.getItem("rulequant:adminToken") || process.env.NEXT_PUBLIC_RULEQUANT_ADMIN_TOKEN || "";
      if (token) void get().publishCloudState("auto");
    }
  },
  publishCloudState: async (reason = "manual") => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("rulequant:adminToken") || process.env.NEXT_PUBLIC_RULEQUANT_ADMIN_TOKEN || "";
    const endpoint = window.location.hostname.endsWith("github.io") || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true" ? REMOTE_CLOUD_STATE_ENDPOINT : "/api/cloud/state";
    const state = get();
    set({ cloudPublishStatus: "publishing", cloudPublishMessage: "正在发布到云端..." });
    try {
      const response = await fetch(`${endpoint}?t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        cache: "no-store",
        body: JSON.stringify({
          draws: state.draws,
          rules: state.rules,
          samples: state.samples,
          config: state.config,
          logs: state.operationLogs,
          backups: state.ruleBackups,
          referenceHistory: state.referenceHistory,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { state?: RuleQuantCloudState; error?: string };
      if (response.status === 401) {
        set({
          cloudPublishStatus: "local_only",
          cloudPublishMessage: "已保存到本机。云端设置了管理员密钥，需要管理员发布后朋友才能看到。",
        });
        return;
      }
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      const publishedAt = new Date().toISOString();
      set({
        cloudPublishStatus: "published",
        cloudPublishMessage: reason === "auto" ? "已同步到云端" : "已发布到云端，朋友刷新后可看到。",
        lastCloudPublishAt: publishedAt,
        cloudStateMeta: data.state?.meta ?? state.cloudStateMeta,
      });
    } catch (error) {
      set({
        cloudPublishStatus: "failed",
        cloudPublishMessage: `本机已保存，云端发布失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
  resetSeed: async () => {
    const nextRules = mergeRulesWithSeedRules(seedRules);
    const backup = makeRuleBackup(get().rules, "恢复示例数据前自动备份");
    const log = makeLog({ type: "rules_reset", message: "恢复示例数据和内置公式", formulaCount: nextRules.length });
    set({
      draws: seedDraws,
      rules: nextRules,
      samples: seedSampleCases,
      config: defaultConfig,
      selectedRuleId: nextRules[0]?.id ?? "",
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  resetRules: async () => {
    const nextRules = mergeRulesWithSeedRules(seedRules);
    const backup = makeRuleBackup(get().rules, "重置为内置公式前自动备份");
    const log = makeLog({ type: "rules_reset", message: "公式库已重置为内置公式", formulaCount: nextRules.length });
    set({
      rules: nextRules,
      selectedRuleId: nextRules[0]?.id ?? "",
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  importDraws: async (records) => {
    const merged = new Map(get().draws.map((draw) => [draw.issue, draw]));
    records.forEach((record) => merged.set(record.issue, record));
    const nextDraws = sortDraws([...merged.values()]);
    const latest = nextDraws.at(-1);
    const log = makeLog({
      type: "sync_draws",
      message: `合并导入开奖数据 ${records.length} 条`,
      issue: latest?.issue,
      dataCount: nextDraws.length,
    });
    set({ draws: nextDraws, operationLogs: trimLogs([log, ...get().operationLogs]) });
    await get().persist();
  },
  replaceDraws: async (records) => {
    if (!records.length) {
      const log = makeLog({
        type: "sync_draws",
        message: "忽略空开奖数据替换请求，已保留现有开奖库",
        dataCount: get().draws.length,
      });
      set({ operationLogs: trimLogs([log, ...get().operationLogs]) });
      await get().persist();
      return;
    }
    const merged = new Map(records.map((record) => [record.issue, record]));
    get().draws.filter(isManualDraw).forEach((record) => merged.set(record.issue, record));
    const nextDraws = sortDraws([...merged.values()]);
    const latest = nextDraws.at(-1);
    const log = makeLog({
      type: "sync_draws",
      message: `替换开奖数据 ${nextDraws.length} 条`,
      issue: latest?.issue,
      dataCount: nextDraws.length,
    });
    set({ draws: nextDraws, operationLogs: trimLogs([log, ...get().operationLogs]) });
    await get().persist();
  },
  deleteDraw: async (issue) => {
    const deleted = get().draws.find((draw) => draw.issue === issue);
    const nextDraws = get().draws.filter((draw) => draw.issue !== issue);
    const log = makeLog({
      type: "sync_draws",
      message: `删除开奖数据：${issue}${deleted && isManualDraw(deleted) ? "（人工录入）" : ""}`,
      issue,
      dataCount: nextDraws.length,
      details: {
        sourceType: deleted ? deleted.rawAttributes?.sourceType ?? deleted.sourceUrl ?? "unknown" : "unknown",
        numbers: deleted ? [deleted.n1, deleted.n2, deleted.n3, deleted.n4, deleted.n5, deleted.n6, deleted.special] : [],
      },
    });
    set({ draws: nextDraws, operationLogs: trimLogs([log, ...get().operationLogs]) });
    await get().persist();
  },
  importRules: async (records) => {
    const normalized = records.map((rule) => normalizeRuleForLibrary(rule));
    const backup = makeRuleBackup(get().rules, "导入公式库 JSON 前自动备份");
    const log = makeLog({ type: "rules_imported", message: `导入公式库 ${normalized.length} 条`, formulaCount: normalized.length });
    set({
      rules: normalized,
      selectedRuleId: normalized[0]?.id ?? "",
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  appendRules: async (records, reason = "追加导入 TXT 公式") => {
    return get().addRulesToLibrary(records, reason);
  },
  addRuleToLibrary: async (draft, reason = "加入公式库") => {
    const result = addRuleDraftToLibrary({
      existingRules: get().rules,
      draft,
      mode: draft.id && get().rules.some((rule) => rule.id === draft.id) ? "update" : "add",
    });
    if (!result.ok) {
      const log = makeLog({
        type: "calculation_error",
        message: `${reason}失败：${result.reason}`,
        ruleId: result.duplicate?.id,
        ruleName: result.duplicate?.name,
        details: { errors: result.errors, duplicateId: result.duplicate?.id, signature: result.signature },
      });
      set({ operationLogs: trimLogs([log, ...get().operationLogs]) });
      await get().persist();
      return result;
    }

    const existed = get().rules.some((rule) => rule.id === result.rule.id);
    const backup = makeRuleBackup(get().rules, `${reason}前自动备份`);
    const log = makeLog({
      type: existed ? "rule_updated" : "rule_created",
      message: `${reason}：${result.rule.name}`,
      ruleId: result.rule.id,
      ruleName: result.rule.name,
      formulaCount: result.rules.length,
      details: {
        sourceType: result.rule.sourceType,
        participatesInReference: result.rule.participatesInReference,
        signature: result.signature,
      },
    });
    set({
      rules: result.rules,
      selectedRuleId: result.rule.id,
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    writeSelectedRuleId(result.rule.id);
    await get().persist();
    return result;
  },
  addRulesToLibrary: async (drafts, reason = "批量加入公式库") => {
    const result = addRuleDraftsToLibrary(get().rules, drafts);
    const backup = makeRuleBackup(get().rules, `${reason}前自动备份`);
    const log = makeLog({
      type: "rules_imported",
      message: `${reason}：新增 ${result.added.length} 条，重复 ${result.duplicates.length} 条，失败 ${result.failed.length} 条`,
      formulaCount: result.rules.length,
      details: {
        addedIds: result.added.map((rule) => rule.id),
        duplicateIds: result.duplicates.map((rule) => rule.id),
        failedReasons: result.failed.map((item) => item.reason),
      },
    });
    set({
      rules: result.rules,
      selectedRuleId: result.added[0]?.id ?? get().selectedRuleId,
      ruleBackups: result.added.length ? trimBackups([backup, ...get().ruleBackups]) : get().ruleBackups,
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
    return result;
  },
  restoreLastRuleBackup: async () => {
    const backupToRestore = get().ruleBackups[0];
    if (!backupToRestore) return;
    const currentBackup = makeRuleBackup(get().rules, "恢复上一次公式库前自动备份");
    const restoredRules = backupToRestore.rules.map((rule) => normalizeRuleForLibrary(rule));
    const log = makeLog({
      type: "rules_restored",
      message: `已恢复公式库备份：${backupToRestore.reason}`,
      formulaCount: restoredRules.length,
    });
    set({
      rules: restoredRules,
      selectedRuleId: restoredRules[0]?.id ?? "",
      ruleBackups: trimBackups([currentBackup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  addOperationLog: async (logInput) => {
    const log = makeLog(logInput);
    set({ operationLogs: trimLogs([log, ...get().operationLogs]) });
    await get().persist();
  },
  saveReferenceHistory: async (record) => {
    const nextHistory = trimReferenceHistory([record, ...get().referenceHistory.filter((item) => item.id !== record.id)]);
    const log = makeLog({
      type: "generate_reference",
      message: `${record.saveType === "manual" ? "手动保存" : "自动保存"}综合推荐记录：${record.baseIssue ?? "-"}期`,
      issue: record.baseIssue,
      formulaCount: record.ruleCount,
      signalCount: record.signalCount,
      details: {
        top8: record.topNumbers8.map((item) => item.number),
        top18: record.topNumbers18.map((item) => item.number),
        top9Zodiacs: record.topZodiacs9.map((item) => item.zodiac),
      },
    });
    set({
      referenceHistory: nextHistory,
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await persistReferenceHistoryAndLogs(get().referenceHistory, get().operationLogs);
  },
  deleteReferenceHistory: async (recordId) => {
    set({ referenceHistory: get().referenceHistory.filter((record) => record.id !== recordId) });
    await persistReferenceHistoryAndLogs(get().referenceHistory, get().operationLogs);
  },
  clearReferenceHistory: async () => {
    const log = makeLog({ type: "generate_reference", message: "清空综合推荐历史记录" });
    set({ referenceHistory: [], operationLogs: trimLogs([log, ...get().operationLogs]) });
    await persistReferenceHistoryAndLogs(get().referenceHistory, get().operationLogs);
  },
  upsertRule: async (rule) => {
    return get().addRuleToLibrary(rule, get().rules.some((item) => item.id === rule.id) ? "修改公式" : "新增公式");
  },
  duplicateRule: async (ruleId) => {
    const rule = get().rules.find((item) => item.id === ruleId);
    if (!rule) return;
    const result = addRuleDraftToLibrary({
      existingRules: get().rules,
      draft: {
        ...rule,
        id: undefined,
        name: `${rule.name} 副本`,
        sourceType: "copied",
        origin: rule.id,
        manuallyConfirmed: false,
      },
      mode: "add",
      allowDuplicate: true,
    });
    if (!result.ok) {
      const log = makeLog({
        type: "calculation_error",
        message: `复制公式失败：${result.reason}`,
        ruleId: rule.id,
        ruleName: rule.name,
        details: { errors: result.errors },
      });
      set({ operationLogs: trimLogs([log, ...get().operationLogs]) });
      await get().persist();
      return;
    }
    const backup = makeRuleBackup(get().rules, `复制公式：${rule.name}`);
    const log = makeLog({ type: "rule_created", message: `复制公式：${result.rule.name}`, ruleId: result.rule.id, ruleName: result.rule.name, formulaCount: result.rules.length });
    set({
      rules: result.rules,
      selectedRuleId: result.rule.id,
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
    return;
  },
  deleteRule: async (ruleId) => {
    const deleted = get().rules.find((item) => item.id === ruleId);
    const rules = get().rules.filter((item) => item.id !== ruleId);
    const backup = makeRuleBackup(get().rules, `删除公式：${deleted?.name ?? ruleId}`);
    const log = makeLog({ type: "rule_deleted", message: `删除公式：${deleted?.name ?? ruleId}`, ruleId, ruleName: deleted?.name, formulaCount: rules.length });
    set({
      rules,
      selectedRuleId: rules[0]?.id ?? "",
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  toggleRule: async (ruleId) => {
    const target = get().rules.find((rule) => rule.id === ruleId);
    const nextEnabled = !target?.enabled;
    const backup = makeRuleBackup(get().rules, `${nextEnabled ? "启用" : "停用"}公式：${target?.name ?? ruleId}`);
    const log = makeLog({
      type: nextEnabled ? "rule_enabled" : "rule_disabled",
      message: `${nextEnabled ? "启用" : "停用"}公式：${target?.name ?? ruleId}`,
      ruleId,
      ruleName: target?.name,
    });
    set({
      rules: get().rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled, updatedAt: new Date().toISOString() } : rule)),
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  toggleReferenceParticipation: async (ruleId) => {
    const target = get().rules.find((rule) => rule.id === ruleId);
    const nextParticipates = target?.participatesInReference === false;
    const backup = makeRuleBackup(get().rules, `${nextParticipates ? "加入" : "退出"}综合参考：${target?.name ?? ruleId}`);
    const log = makeLog({
      type: "rule_reference_changed",
      message: `${nextParticipates ? "加入" : "退出"}综合参考：${target?.name ?? ruleId}`,
      ruleId,
      ruleName: target?.name,
    });
    set({
      rules: get().rules.map((rule) =>
        rule.id === ruleId
          ? { ...rule, participatesInReference: rule.participatesInReference === false, updatedAt: new Date().toISOString() }
          : rule,
      ),
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  confirmRule: async (ruleId) => {
    const target = get().rules.find((rule) => rule.id === ruleId);
    const backup = makeRuleBackup(get().rules, `人工确认公式：${target?.name ?? ruleId}`);
    const log = makeLog({ type: "rule_updated", message: `人工确认公式：${target?.name ?? ruleId}`, ruleId, ruleName: target?.name });
    set({
      rules: get().rules.map((rule) => (rule.id === ruleId ? { ...rule, manuallyConfirmed: true, updatedAt: new Date().toISOString() } : rule)),
      ruleBackups: trimBackups([backup, ...get().ruleBackups]),
      operationLogs: trimLogs([log, ...get().operationLogs]),
    });
    await get().persist();
  },
  setSelectedRule: (ruleId) => {
    writeSelectedRuleId(ruleId);
    set({ selectedRuleId: ruleId });
  },
  upsertSample: async (sample) => {
    const samples = get().samples.filter((item) => item.id !== sample.id);
    set({ samples: [sample, ...samples] });
    await get().persist();
  },
  updateConfig: async (config) => {
    const validatedConfig = validateRuleQuantConfig({
      ...defaultConfig,
      ...config,
      colorValues: defaultConfig.colorValues,
      elementTable: defaultConfig.elementTable,
      elementValues: defaultConfig.elementValues,
    });
    const draw = get().draws[0] ?? seedDraws[0];
    normalizeDraw(draw, validatedConfig);
    const rule = get().rules[0] ?? seedRules[0];
    runRuleCalculation(rule, normalizeDraw(draw, validatedConfig), validatedConfig);
    const log = makeLog({ type: "rule_updated", message: "修改基础表配置，综合参考需要重新计算" });
    set({ config: validatedConfig, operationLogs: trimLogs([log, ...get().operationLogs]) });
    await get().persist();
  },
}));
