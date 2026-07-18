import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule, calculateRuleDetail, type CalculateRuleContext } from "@/lib/formula-engine/formula-engine";
import type {
  BacktestDetail,
  BacktestResult,
  NormalizedDraw,
  RuleBacktestResult,
  RuleQuantConfig,
  RuleRecord,
} from "@/types/domain";

type RunBacktestInput = {
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

function backtestCacheKey(input: RunBacktestInput): string {
  return JSON.stringify({
    fromIssue: input.fromIssue ?? "",
    toIssue: input.toIssue ?? "",
    draws: input.draws.map((draw) => [draw.issue, draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special]),
    rules: input.rules.map((rule) => [
      rule.id,
      rule.updatedAt,
      rule.enabled,
      rule.category,
      rule.orderMode,
      rule.formula,
      rule.normalizer,
      rule.target,
      rule.positionPattern,
      rule.anchorIssue ?? "",
      rule.anchorPatternIndex ?? "",
      rule.periodSpan,
      rule.verifyOffset ?? "",
    ]),
    config: input.config,
  });
}

export function clearBacktestCache(): void {
  backtestCache.clear();
}

export function getBacktestCacheSize(): number {
  return backtestCache.size;
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

function buildRuleResult(rule: RuleRecord, normalizedDraws: NormalizedDraw[], config: RuleQuantConfig): RuleBacktestResult {
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
    backtestCache.set(key, cached);
    return cached;
  }

  const normalizedDraws = input.draws
    .map((draw) => normalizeDraw(draw, input.config))
    .filter((draw) => (!input.fromIssue || draw.issue >= input.fromIssue) && (!input.toIssue || draw.issue <= input.toIssue));

  const result = {
    generatedAt: new Date().toISOString(),
    ruleResults: input.rules
      .filter((rule) => rule.enabled)
      .map((rule) => buildRuleResult(rule, normalizedDraws, input.config)),
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
