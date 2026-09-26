import { buildDataHealthReport } from "@/lib/formula-analysis/data-health";
import { backtestMathKey } from "@/lib/backtest/backtest-identity";
import { buildFormulaPairDiagnostics } from "@/lib/formula-analysis/formula-conflicts";
import { buildFormulaHealthReport } from "@/lib/formula-analysis/formula-health";
import { normalizeFormulaAnalysisWindow } from "@/lib/formula-analysis/windows";
import type {
  FormulaAnalysisReport,
  FormulaAnalysisWindow,
} from "@/lib/formula-analysis/types";
import {
  buildFormulaDrawLandingAnalysis,
} from "@/lib/formula-summary/formula-draw-landing";
import {
  buildFormulaSummaryReport,
  type FormulaSummaryAction,
  type FormulaSummaryPeriod,
  type FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type FormulaAnalysisReportInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  window: FormulaAnalysisWindow;
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  ruleIds?: string[];
  source: {
    label: string;
    updatedAt?: string;
    offline?: boolean;
    partial?: boolean;
  };
  authoritativeIssueSequence?: string[];
  now?: string;
};

const MAX_CACHE_ENTRIES = 4;
const reportCache = new Map<string, FormulaAnalysisReport>();
const summaryCache = new Map<string, ReturnType<typeof buildFormulaSummaryReport>>();
const healthCache = new Map<string, ReturnType<typeof buildFormulaHealthReport>>();
const pairCache = new Map<string, ReturnType<typeof buildFormulaPairDiagnostics>>();

function cachedLayer<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const value = create();
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return value;
}

function sortedUnique(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function cacheIdentity(input: FormulaAnalysisReportInput): string {
  return JSON.stringify({
    window: input.window,
    action: input.action,
    targetType: input.targetType,
    ruleIds: sortedUnique(input.ruleIds),
    draws: input.draws,
    rules: input.rules,
    config: input.config,
    source: input.source,
    authoritativeIssueSequence: input.authoritativeIssueSequence,
    now: input.now,
  });
}

function compactFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fa-${(hash >>> 0).toString(36)}`;
}

export function formulaAnalysisInputKey(input: FormulaAnalysisReportInput): string {
  return compactFingerprint(cacheIdentity(input));
}

function cacheGet(key: string): FormulaAnalysisReport | undefined {
  const report = reportCache.get(key);
  if (!report) return undefined;
  reportCache.delete(key);
  reportCache.set(key, report);
  return report;
}

function cacheSet(key: string, report: FormulaAnalysisReport): void {
  reportCache.set(key, report);
  while (reportCache.size > MAX_CACHE_ENTRIES) {
    const oldest = reportCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    reportCache.delete(oldest);
  }
}

function filterPeriods(
  periods: FormulaSummaryPeriod[],
  targetType: FormulaSummaryTargetType,
): FormulaSummaryPeriod[] {
  return periods.map((period) => ({
    ...period,
    contributions: period.contributions.filter((contribution) => (
      contribution.targetType === targetType
    )),
  }));
}

function formulaErrors(periods: FormulaSummaryPeriod[]) {
  const unique = new Map<string, { ruleId: string; ruleName: string; message: string }>();
  for (const period of periods) {
    for (const skipped of period.skippedRules) {
      const key = `${skipped.ruleId}\u0000${skipped.error}`;
      if (!unique.has(key)) {
        unique.set(key, {
          ruleId: skipped.ruleId,
          ruleName: skipped.ruleName,
          message: skipped.error,
        });
      }
    }
  }
  return [...unique.values()];
}

export function clearFormulaAnalysisReportCache(): void {
  reportCache.clear();
  summaryCache.clear();
  healthCache.clear();
  pairCache.clear();
}

export function buildFormulaAnalysisReport(
  input: FormulaAnalysisReportInput,
): FormulaAnalysisReport {
  input = { ...input, window: normalizeFormulaAnalysisWindow(input.window) };
  const key = cacheIdentity(input);
  const cached = cacheGet(key);
  if (cached) return cached;

  const requestedRuleIds = new Set(sortedUnique(input.ruleIds));
  const rules = requestedRuleIds.size > 0
    ? input.rules.filter((rule) => requestedRuleIds.has(rule.id))
    : input.rules;
  const selectedRuleIds = rules.map((rule) => rule.id).sort();
  // Action/type switches change chart selection, not arithmetic or formula health.
  const layerKey = `${backtestMathKey({ ...input, rules })}\u001f${input.window}\u001f${JSON.stringify(rules.map((rule) => [rule.id, rule.name]))}`;
  const rawSummary = cachedLayer(summaryCache, layerKey, () => buildFormulaSummaryReport({
    draws: input.draws,
    rules,
    config: input.config,
    maxPeriods: input.window + 1,
  }));
  const periods = filterPeriods(rawSummary.periods, input.targetType);
  const contributionCount = periods.reduce(
    (total, period) => total + period.contributions.length,
    0,
  );
  const summary = {
    ...rawSummary,
    periods,
    latestPeriod: periods.at(-1),
    contributionCount,
  };
  const health = cachedLayer(healthCache, layerKey, () => buildFormulaHealthReport({ draws: input.draws, rules, config: input.config, window: input.window }));
  const pairs = cachedLayer(pairCache, `${layerKey}\u001f${input.targetType}`, () => buildFormulaPairDiagnostics({ periods }));
  const landing = buildFormulaDrawLandingAnalysis({
    periods,
    action: input.action,
    targetType: input.targetType,
    config: input.config,
    completedLimit: input.window,
    matrixLimit: input.window + 1,
  });
  const dataHealth = buildDataHealthReport({
    draws: input.draws,
    rules,
    config: input.config,
    source: input.source,
    formulaErrors: formulaErrors(periods),
    authoritativeIssueSequence: input.authoritativeIssueSequence,
    now: input.now,
  });
  const report: FormulaAnalysisReport = {
    cacheKey: formulaAnalysisInputKey(input),
    generatedAt: input.now ?? new Date().toISOString(),
    window: input.window,
    action: input.action,
    targetType: input.targetType,
    selectedRuleIds,
    summary,
    landing,
    health,
    pairs,
    dataHealth,
  };
  cacheSet(key, report);
  return report;
}
