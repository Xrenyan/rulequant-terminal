"use client";

import { create } from "zustand";
import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { defaultConfig } from "@/lib/config/default-config";
import { seedConfig, seedDraws, seedRules, seedSampleCases } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { loadPersistedState, persistAll } from "@/lib/storage/db";
import {
  addRuleToLibrary as addRuleDraftToLibrary,
  addRulesToLibrary as addRuleDraftsToLibrary,
  normalizeRuleDraft,
  type AddRuleToLibraryResult,
  type AddRulesToLibraryResult,
  type RuleLibraryDraft,
} from "@/lib/rules/rule-library";
import type { RuleQuantCloudState } from "@/lib/cloud/cloud-state";
import type { DrawRecord, OperationLog, RuleLibraryBackup, RuleQuantConfig, RuleRecord, SampleCase } from "@/types/domain";

type RuleQuantState = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  samples: SampleCase[];
  operationLogs: OperationLog[];
  ruleBackups: RuleLibraryBackup[];
  config: RuleQuantConfig;
  cloudStateMeta?: RuleQuantCloudState["meta"];
  hasHydrated: boolean;
  selectedRuleId: string;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  resetSeed: () => Promise<void>;
  resetRules: () => Promise<void>;
  importDraws: (records: DrawRecord[]) => Promise<void>;
  replaceDraws: (records: DrawRecord[]) => Promise<void>;
  importRules: (records: RuleRecord[]) => Promise<void>;
  addRuleToLibrary: (draft: RuleLibraryDraft, reason?: string) => Promise<AddRuleToLibraryResult>;
  addRulesToLibrary: (drafts: RuleLibraryDraft[], reason?: string) => Promise<AddRulesToLibraryResult>;
  appendRules: (records: RuleRecord[], reason?: string) => Promise<AddRulesToLibraryResult>;
  restoreLastRuleBackup: () => Promise<void>;
  addOperationLog: (log: Omit<OperationLog, "id" | "timestamp"> & { timestamp?: string }) => Promise<void>;
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
  return [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
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
  return {
    ...defaultConfig,
    ...(config ?? {}),
    colorValues: defaultConfig.colorValues,
    elementTable: defaultConfig.elementTable,
    elementValues: defaultConfig.elementValues,
  };
}

function mergeRulesWithSeedRules(rules: RuleRecord[]) {
  const seedById = new Map(seedRules.map((rule) => [rule.id, rule]));
  const existing = new Set(rules.map((rule) => rule.id));
  const missingSeedRules = seedRules.filter((rule) => !existing.has(rule.id));
  return [...rules, ...missingSeedRules].map((rule) => normalizeRuleForLibrary(rule, seedById.get(rule.id)));
}

async function loadCloudStateFromApi(): Promise<RuleQuantCloudState | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/cloud/state", { cache: "no-store" });
    if (!response.ok) return null;
    const state = (await response.json()) as RuleQuantCloudState;
    return state.meta?.enabled ? state : null;
  } catch {
    return null;
  }
}

export const useRuleQuantStore = create<RuleQuantState>((set, get) => ({
  draws: seedDraws,
  rules: mergeRulesWithSeedRules(seedRules),
  samples: seedSampleCases,
  operationLogs: [],
  ruleBackups: [],
  config: seedConfig,
  cloudStateMeta: undefined,
  hasHydrated: false,
  selectedRuleId: seedRules[0]?.id ?? "",
  hydrate: async () => {
    const [persisted, cloud] = await Promise.all([loadPersistedState(), loadCloudStateFromApi()]);
    const nextDraws = cloud?.draws.length ? cloud.draws : persisted.draws.length ? persisted.draws : seedDraws;
    const nextRules = cloud?.rules.length ? mergeRulesWithSeedRules(cloud.rules) : persisted.rules.length ? mergeRulesWithSeedRules(persisted.rules) : mergeRulesWithSeedRules(seedRules);
    const nextSamples = cloud?.samples.length ? cloud.samples : persisted.samples.length ? persisted.samples : seedSampleCases;
    const nextConfig = normalizeConfigForCurrentRules(cloud?.config ?? persisted.config ?? seedConfig);
    const nextLogs = cloud?.logs.length ? trimLogs([...cloud.logs, ...(persisted.logs ?? [])]) : trimLogs(persisted.logs ?? []);
    const nextBackups = cloud?.backups.length ? trimBackups([...cloud.backups, ...(persisted.backups ?? [])]) : trimBackups(persisted.backups ?? []);
    set({
      draws: sortDraws(nextDraws),
      rules: nextRules,
      samples: nextSamples,
      operationLogs: nextLogs,
      ruleBackups: nextBackups,
      config: nextConfig,
      cloudStateMeta: cloud?.meta,
      selectedRuleId: nextRules[0]?.id ?? "",
      hasHydrated: true,
    });
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
    });
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
    const nextDraws = sortDraws(records);
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
  setSelectedRule: (ruleId) => set({ selectedRuleId: ruleId }),
  upsertSample: async (sample) => {
    const samples = get().samples.filter((item) => item.id !== sample.id);
    set({ samples: [sample, ...samples] });
    await get().persist();
  },
  updateConfig: async (config) => {
    const draw = get().draws[0] ?? seedDraws[0];
    normalizeDraw(draw, config);
    const rule = get().rules[0] ?? seedRules[0];
    calculateRule(rule, normalizeDraw(draw, config), config);
    const log = makeLog({ type: "rule_updated", message: "修改基础表配置，综合参考需要重新计算" });
    set({ config, operationLogs: trimLogs([log, ...get().operationLogs]) });
    await get().persist();
  },
}));
