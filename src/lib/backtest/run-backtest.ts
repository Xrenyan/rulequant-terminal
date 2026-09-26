import { normalizeDraw } from "@/lib/engine/attributes";
import { backtestDatasetKey, backtestMathKey, ruleMathIdentity } from "@/lib/backtest/backtest-identity";
import { calculateRule, calculateRuleDetail, type CalculateRuleContext } from "@/lib/formula-engine/formula-engine";
import type {
  BacktestDetail,
  BacktestResult,
  NormalizedDraw,
  RuleBacktestResult,
  RuleQuantConfig,
  RuleRecord,
} from "@/types/domain";

export type RunBacktestInput = {
  draws: Array<Parameters<typeof normalizeDraw>[0]>;
  rules: RuleRecord[];
  config: RuleQuantConfig;
  fromIssue?: string;
  toIssue?: string;
  cache?: boolean;
};

export { calculateRule, type CalculateRuleContext };

const backtestCache = new Map<string, BacktestResult>();
const BACKTEST_CACHE_LIMIT = 6;
let ruleDatasetKey = "";
const ruleResultCache = new Map<string, RuleBacktestResult>();
const RULE_RESULT_CACHE_LIMIT = 600;

function backtestCacheKey(input: RunBacktestInput): string {
  return backtestMathKey(input);
}

export function clearBacktestCache(): void {
  backtestCache.clear();
  ruleResultCache.clear();
  ruleDatasetKey = "";
}

export function getBacktestCacheSize(): number {
  return backtestCache.size;
}

/** Cached calculations must never bring an older name or participation flag back. */
export function refreshBacktestRuleMetadata(result: RuleBacktestResult, rule: RuleRecord): RuleBacktestResult {
  if (result.rule === rule) return result;
  return { ...result, rule, details: result.rule.name === rule.name ? result.details
    : result.details.map((detail) => ({ ...detail, ruleName: rule.name })) };
}

function streak(values: boolean[]): { current: number; max: number } {
  let current = 0;
  let max = 0;
  let running = 0;
  for (const value of values) {
    if (value) {
      running += 1;
      max = Math.max(max, running);
    } else {
      running = 0;
    }
  }
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (!values[i]) break;
    current += 1;
  }
  return { current, max };
}

function buildRuleResult(
  rule: RuleRecord,
  normalizedDraws: NormalizedDraw[],
  config: RuleQuantConfig,
  cacheFormulaCalculations: boolean,
): RuleBacktestResult {
  const details: BacktestDetail[] = [];
  const span = Math.max(rule.periodSpan || 1, rule.verifyOffset || 1, rule.category === "eight_zodiac_two_period" ? 2 : 1);

  try {
    for (let index = 0; index < normalizedDraws.length - span; index += 1) {
      details.push(
        calculateRuleDetail({
          rule,
          current: normalizedDraws[index],
          futureDraws: normalizedDraws.slice(index + 1, index + span + 1),
          config,
          periodIndex: index,
          cache: cacheFormulaCalculations,
        }),
      );
    }
  } catch (error) {
    return {
      rule,
      total: 0,
      success: 0,
      failed: 0,
      successRate: 0,
      currentStreak: 0,
      maxStreak: 0,
      last10: [],
      failedIssues: [],
      details: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const values = details.map((detail) => detail.success);
  const successCount = values.filter(Boolean).length;
  const streaks = streak(values);
  return {
    rule,
    total: details.length,
    success: successCount,
    failed: details.length - successCount,
    successRate: details.length ? Number(((successCount / details.length) * 100).toFixed(2)) : 0,
    currentStreak: streaks.current,
    maxStreak: streaks.max,
    last10: values.slice(-10),
    failedIssues: details.filter((detail) => !detail.success).map((detail) => detail.currentIssue),
    details,
  };
}

export function runBacktest(input: RunBacktestInput): BacktestResult {
  const shouldCache = input.cache !== false;
  const key = shouldCache ? backtestCacheKey(input) : "";
  const cached = shouldCache ? backtestCache.get(key) : undefined;
  if (cached) {
    backtestCache.delete(key);
    const rules = new Map(input.rules.map((rule) => [rule.id, rule]));
    const ruleResults = cached.ruleResults.map((result) => refreshBacktestRuleMetadata(result, rules.get(result.rule.id)!));
    const refreshed = ruleResults.every((result, index) => result === cached.ruleResults[index]) ? cached : { ...cached, ruleResults };
    backtestCache.set(key, refreshed);
    return refreshed;
  }

  if (shouldCache) {
    const datasetKey = backtestDatasetKey(input);
    if (datasetKey !== ruleDatasetKey) {
      // A persistent worker should not retain six complete versions of changing draw history.
      backtestCache.clear();
      ruleResultCache.clear();
      ruleDatasetKey = datasetKey;
    }
  }

  const normalizedDraws = input.draws
    .map((draw) => normalizeDraw(draw, input.config))
    .filter((draw) => (!input.fromIssue || draw.issue >= input.fromIssue) && (!input.toIssue || draw.issue <= input.toIssue));

  const result = {
    generatedAt: new Date().toISOString(),
    ruleResults: input.rules
      .filter((rule) => rule.enabled)
      .map((rule) => {
        if (!shouldCache) return buildRuleResult(rule, normalizedDraws, input.config, false);
        const ruleKey = JSON.stringify(ruleMathIdentity(rule));
        const previous = ruleResultCache.get(ruleKey);
        // This cache already owns complete results. Avoid a second, enormous per-expression cache.
        const computed = previous ? refreshBacktestRuleMetadata(previous, rule) : buildRuleResult(rule, normalizedDraws, input.config, false);
        ruleResultCache.delete(ruleKey);
        ruleResultCache.set(ruleKey, computed);
        while (ruleResultCache.size > RULE_RESULT_CACHE_LIMIT) ruleResultCache.delete(ruleResultCache.keys().next().value!);
        return computed;
      }),
  };

  if (shouldCache) {
    backtestCache.set(key, result);
    while (backtestCache.size > BACKTEST_CACHE_LIMIT) {
      const oldestKey = backtestCache.keys().next().value;
      if (!oldestKey) break;
      backtestCache.delete(oldestKey);
    }
  }
  return result;
}
