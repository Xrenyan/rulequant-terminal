import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { canRuleParticipateInReference, type RuleValidationSummary } from "@/lib/rules/rule-validation";
import type {
  BacktestResult,
  DrawRecord,
  RuleBacktestResult,
  RuleQuantConfig,
  RuleRecord,
  RuleSignal,
  RuleSignalAction,
  RuleSignalTargetType,
} from "@/types/domain";

export type BuildRuleSignalsInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  backtest?: BacktestResult;
  validationSummaries?: RuleValidationSummary[];
};

function sortDraws(draws: DrawRecord[]): DrawRecord[] {
  return [...draws].sort((a, b) => {
    const aNumber = /^\d+$/.test(a.issue) ? Number(a.issue) : undefined;
    const bNumber = /^\d+$/.test(b.issue) ? Number(b.issue) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) return aNumber - bNumber;
    if (aNumber !== undefined) return 1;
    if (bNumber !== undefined) return -1;
    return a.issue.localeCompare(b.issue, "zh-CN", { numeric: true });
  });
}

function recentRate(result?: RuleBacktestResult): number {
  if (!result?.last10.length) return result?.successRate ?? 0;
  return Number(((result.last10.filter(Boolean).length / result.last10.length) * 100).toFixed(2));
}

function wrongStreak(result?: RuleBacktestResult): number {
  if (!result?.details.length) return 0;
  let count = 0;
  for (let index = result.details.length - 1; index >= 0; index -= 1) {
    if (result.details[index].success) break;
    count += 1;
  }
  return count;
}

function ruleWeight(result?: RuleBacktestResult): number {
  const success = result?.successRate ?? 0;
  const recent = recentRate(result);
  const streak = Math.min(result?.currentStreak ?? 0, 10);
  const wrong = Math.min(wrongStreak(result), 12);
  const failedRate = result?.total ? result.failed / result.total : 1;
  return Number(Math.max(0.1, 1 + success / 100 * 0.72 + recent / 100 * 0.5 + streak * 0.06 - wrong * 0.12 - failedRate * 0.45).toFixed(3));
}

function targetForCategory(category: RuleRecord["category"]): { action: RuleSignalAction; targetType: RuleSignalTargetType } {
  switch (category) {
    case "kill_zodiac":
      return { action: "exclude", targetType: "zodiac" };
    case "include_zodiac":
      return { action: "include", targetType: "zodiac" };
    case "kill_color":
      return { action: "exclude", targetType: "color" };
    case "include_color":
      return { action: "include", targetType: "color" };
    case "kill_parity":
      return { action: "exclude", targetType: "parity" };
    case "include_parity":
      return { action: "include", targetType: "parity" };
    case "kill_size":
      return { action: "exclude", targetType: "size" };
    case "include_size":
      return { action: "include", targetType: "size" };
    case "kill_sum":
      return { action: "exclude", targetType: "sum" };
    case "kill_tail":
      return { action: "exclude", targetType: "tail" };
    case "kill_head":
      return { action: "exclude", targetType: "head" };
    case "kill_element":
      return { action: "exclude", targetType: "element" };
    case "kill_segment":
      return { action: "exclude", targetType: "segment" };
    case "seven_tail":
      return { action: "include", targetType: "tail" };
    case "six_zodiac":
    case "eight_zodiac":
    case "eight_zodiac_two_period":
    case "nine_zodiac":
    case "kill_three_as_nine":
      return { action: "include", targetType: "zodiac" };
    default:
      return { action: "include", targetType: "number" };
  }
}

function makeSignal(
  rule: RuleRecord,
  result: RuleBacktestResult | undefined,
  action: RuleSignalAction,
  targetType: RuleSignalTargetType,
  targets: Array<number | string>,
  process: string[],
): RuleSignal {
  const weight = ruleWeight(result);
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category,
    action,
    targetType,
    targets,
    weight,
    scoreDelta: action === "include" ? weight : -weight,
    successRate: result?.successRate ?? 0,
    recentRate: recentRate(result),
    currentStreak: result?.currentStreak ?? 0,
    wrongStreak: wrongStreak(result),
    formula: rule.formula,
    process,
    sourceType: rule.sourceType ?? "user_provided",
  };
}

export function buildRuleSignals(input: BuildRuleSignalsInput): RuleSignal[] {
  const normalizedDraws = sortDraws(input.draws).map((draw) => normalizeDraw(draw, input.config));
  const latest = normalizedDraws.at(-1);
  if (!latest) return [];
  const latestPeriodIndex = normalizedDraws.length - 1;
  const validationMap = new Map(input.validationSummaries?.map((summary) => [summary.ruleId, summary]));

  return input.rules
    .filter((rule) => canRuleParticipateInReference(rule, validationMap.get(rule.id)))
    .flatMap((rule) => {
      try {
        const calculation = calculateRule(rule, latest, input.config, { periodIndex: latestPeriodIndex });
        const result = input.backtest?.ruleResults.find((item) => item.rule.id === rule.id);

        if (rule.category === "kill_three_as_nine") {
          const includeTargets = calculation.mappedResult;
          const excludeTargets =
            calculation.secondaryMappedResult?.length
              ? calculation.secondaryMappedResult
              : input.config.zodiacOrder.filter((zodiac) => !includeTargets.includes(zodiac));
          return [
            makeSignal(rule, result, "include", "zodiac", includeTargets, calculation.process),
            makeSignal(rule, result, "exclude", "zodiac", excludeTargets, calculation.process),
          ];
        }

        const target = targetForCategory(rule.category);
        return [makeSignal(rule, result, target.action, target.targetType, calculation.mappedResult, calculation.process)];
      } catch {
        return [];
      }
    });
}
