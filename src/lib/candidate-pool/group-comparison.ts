import { buildReferenceObservation } from "@/lib/candidate-pool/candidate-pool";
import { runBacktest } from "@/lib/backtest/run-backtest";
import type { BacktestResult, DrawRecord, ReferenceObservationItem, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type GroupComparisonInput = {
  draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; backtest?: BacktestResult;
  window: number; selectedRuleIds: string[]; mode: "group" | "unique";
};
export type ComparisonSummary = { total: number; top8: number; top12: number; top18: number; zodiac7: number; zodiac9: number };
export type GroupComparisonReport = {
  window: number; mode: GroupComparisonInput["mode"]; requestedRuleCount: number; availableRuleCount: number;
  all: ComparisonSummary; selected: ComparisonSummary;
  rows: Array<{ issue: string; special: number; zodiac: string; all: ReferenceObservationItem; selected: ReferenceObservationItem }>;
};

function summarize(rows: ReferenceObservationItem[]): ComparisonSummary {
  return { total: rows.length, top8: rows.filter((r) => r.hitTop8).length, top12: rows.filter((r) => r.hitTop12).length,
    top18: rows.filter((r) => r.hitTop18).length, zodiac7: rows.filter((r) => r.hitZodiac7).length, zodiac9: rows.filter((r) => r.hitZodiac9).length };
}

export function compareFormulaGroups(input: GroupComparisonInput): GroupComparisonReport {
  const selectedIds = new Set(input.selectedRuleIds);
  const selectedRules = input.mode === "unique" ? input.rules : input.rules.filter((rule) => selectedIds.has(rule.id));
  if (input.mode === "group" && !selectedRules.some((rule) => rule.enabled && rule.participatesInReference !== false)) {
    throw new Error("这组还没有可参与比较的公式，请选择已启用的公式。");
  }
  const backtest = input.backtest ?? runBacktest({ draws: input.draws, rules: input.rules, config: input.config });
  const all = buildReferenceObservation({ ...input, backtest });
  const selected = buildReferenceObservation({ ...input, backtest, rules: selectedRules, collapseIdenticalOutputs: input.mode === "unique" });
  const selectedByIssue = new Map(selected.items.filter((row) => row.ruleCount > 0).map((row) => [row.issue, row]));
  const rows = all.items.filter((row) => row.ruleCount > 0).flatMap((row) => {
    const other = selectedByIssue.get(row.issue);
    return other ? [{ issue: row.issue, special: row.special, zodiac: row.zodiac, all: row, selected: other }] : [];
  });
  return { window: all.window, mode: input.mode, requestedRuleCount: selectedIds.size,
    availableRuleCount: selectedRules.filter((rule) => rule.enabled && rule.participatesInReference !== false).length,
    all: summarize(rows.map((row) => row.all)), selected: summarize(rows.map((row) => row.selected)), rows };
}
