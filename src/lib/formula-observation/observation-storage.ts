"use client";

import Dexie, { type Table } from "dexie";
import { formulaObservationVersionKey, sortObservationDraws, updateFormulaObservation, type FormulaObservationVersion } from "./formula-observation";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

class ObservationDatabase extends Dexie {
  versions!: Table<FormulaObservationVersion, string>;
  constructor() { super("rulequant-formula-observation"); this.version(1).stores({ versions: "id,ruleId,startedAt" }); }
}
const observationDb = new ObservationDatabase();
export const OBSERVATION_EVENT = "rulequant:observations-changed";
let queue: Promise<unknown> = Promise.resolve();
const MAX_VERSIONS_PER_RULE = 20;
function canCapture(draws: DrawRecord[], versions: FormulaObservationVersion[]) {
  const latest = sortObservationDraws(draws).at(-1)?.issue;
  return Boolean(latest && versions.every((v) => !v.latestSeenIssue || latest.localeCompare(v.latestSeenIssue, "zh-CN", { numeric: true }) >= 0));
}
function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const operation = queue.catch(() => undefined).then(action);
  queue = operation;
  return operation;
}
function notify() { if (typeof window !== "undefined") window.dispatchEvent(new Event(OBSERVATION_EVENT)); }

export async function readFormulaObservations(ruleId: string) {
  return observationDb.versions.where("ruleId").equals(ruleId).toArray();
}
export function enrollFormulaObservation(rule: RuleRecord, draws: DrawRecord[], config: RuleQuantConfig) {
  return enqueue(async () => {
    const id = formulaObservationVersionKey(rule, config);
    await observationDb.transaction("rw", observationDb.versions, async () => {
      const previous = await observationDb.versions.get(id);
      const versions = await observationDb.versions.where("ruleId").equals(rule.id).toArray();
      if (!previous && versions.length >= MAX_VERSIONS_PER_RULE) throw new Error("这条公式已保存20个观察版本，已暂停新增版本，旧记录仍保留。");
      if (!canCapture(draws, versions)) throw new Error("当前数据比以前看过的记录更早，请先更新到最新开奖再开始观察。");
      const next = updateFormulaObservation({ previous, rule, config, draws, now: new Date().toISOString(), capture: true });
      if (next.captureError || !next.predictions.length) throw new Error(next.captureError ?? "还没有可记录的公式结果，请先启用公式并更新开奖。");
      await observationDb.versions.put(next);
    });
    notify();
  });
}
export function synchronizeFormulaObservations(draws: DrawRecord[], rules: RuleRecord[], config: RuleQuantConfig) {
  return enqueue(async () => {
    let changed = false;
    await observationDb.transaction("rw", observationDb.versions, async () => {
      const versions = await observationDb.versions.toArray();
      const knownIds = new Set(versions.map((version) => version.id));
      const enrolledRules = new Set(versions.map((version) => version.ruleId));
      const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));
      const now = new Date().toISOString();
      for (const previous of versions) {
        const currentRule = ruleMap.get(previous.ruleId);
        const current = Boolean(currentRule?.enabled && formulaObservationVersionKey(currentRule, config) === previous.id);
        const next = updateFormulaObservation({ previous, rule: previous.rule, config: previous.config, draws, now, capture: current });
        if (next !== previous) { await observationDb.versions.put(next); changed = true; }
      }
      for (const ruleId of enrolledRules) {
        const rule = ruleMap.get(ruleId);
        if (!rule?.enabled) continue;
        const id = formulaObservationVersionKey(rule, config);
        if (knownIds.has(id)) continue;
        const earlierVersions = versions.filter((v) => v.ruleId === ruleId);
        if (!canCapture(draws, earlierVersions)) continue;
        if (earlierVersions.length >= MAX_VERSIONS_PER_RULE) {
          const latest = earlierVersions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
          const captureError = "这条公式已保存20个观察版本，已暂停新增版本，旧记录仍保留。";
          if (latest.captureError !== captureError) { await observationDb.versions.update(latest.id, { captureError }); changed = true; }
          continue;
        }
        await observationDb.versions.put(updateFormulaObservation({ rule, config, draws, now, capture: true }));
        changed = true;
      }
    });
    if (changed) notify();
  });
}
