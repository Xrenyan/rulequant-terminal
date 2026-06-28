import { runBacktest } from "@/lib/backtest/run-backtest";
import type { DrawRecord, RuleBacktestResult, RuleCategory, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type FormulaDiscoveryCandidate = RuleBacktestResult & {
  score: number;
  trainingRate: number;
  validationRate: number;
  trainingResult: RuleBacktestResult;
  validationResult: RuleBacktestResult;
};

export type FormulaDiscoveryInput = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
  limit?: number;
  categories?: RuleCategory[];
  variablePool?: string[];
  maxTerms?: number;
  trainRatio?: number;
  minTrainingRate?: number;
  minValidationRate?: number;
};

const DEFAULT_CATEGORIES: RuleCategory[] = ["kill_zodiac", "kill_tail", "kill_sum", "kill_head", "kill_segment", "kill_element"];
const DEFAULT_VARIABLES = ["尾(平1)", "尾(平2)", "合(平3)", "段(平4)", "头(平5)", "特码合", "总数尾", "期尾"];

function normalizerFor(category: RuleCategory): string {
  switch (category) {
    case "kill_zodiac":
      return "subtract_48_to_1_49";
    case "kill_sum":
      return "subtract_13_to_1_13";
    case "kill_tail":
      return "mod_10";
    case "kill_head":
      return "subtract_5_to_0_4";
    case "kill_element":
      return "subtract_5_to_1_5";
    case "kill_segment":
      return "subtract_7_to_1_7";
    case "seven_tail":
      return "tail_offsets";
    case "nine_zodiac":
      return "nine_zodiac";
    default:
      return "auto";
  }
}

function targetFor(category: RuleCategory): string {
  switch (category) {
    case "kill_zodiac":
    case "eight_zodiac":
    case "eight_zodiac_two_period":
    case "nine_zodiac":
    case "kill_three_as_nine":
      return "special_zodiac";
    case "kill_sum":
      return "special_sum";
    case "kill_tail":
    case "seven_tail":
      return "special_tail";
    case "kill_head":
      return "special_head";
    case "kill_element":
      return "special_element";
    case "kill_segment":
      return "special_segment";
    default:
      return "special";
  }
}

function combinations(items: string[], maxTerms: number, exactTerms?: number): string[][] {
  const output: string[][] = [];
  function walk(start: number, current: string[]) {
    if (current.length >= 2 && (!exactTerms || current.length === exactTerms)) output.push([...current]);
    if (current.length >= maxTerms) return;
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  }
  walk(0, []);
  return output;
}

function makeRule(category: RuleCategory, formula: string, index: number): RuleRecord {
  const now = new Date().toISOString();
  return {
    id: `auto-${category}-${index}`,
    name: `自动筛选 ${index + 1}`,
    category,
    orderMode: "L",
    formula,
    normalizer: normalizerFor(category),
    target: targetFor(category),
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    enabled: false,
    sourceType: "system_recommended",
    participatesInReference: false,
    tags: ["自动筛选"],
    description: "由历史数据自动组合测试生成，加入公式库后才参与综合参考结果。",
    sourceFile: "系统自动筛选",
    examples: [],
    createdAt: now,
    updatedAt: now,
  };
}

function splitDraws(draws: DrawRecord[], ratio: number): { sortedDraws: DrawRecord[]; cut: number } {
  const sorted = [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
  const boundedRatio = Math.min(Math.max(ratio, 0.5), 0.85);
  const cut = Math.max(3, Math.min(sorted.length - 2, Math.floor(sorted.length * boundedRatio)));
  return {
    sortedDraws: sorted,
    cut,
  };
}

function ruleSpan(rule: RuleRecord): number {
  return Math.max(rule.periodSpan || 1, rule.verifyOffset || 1, rule.category === "eight_zodiac_two_period" ? 2 : 1);
}

function summarizeResult(result: RuleBacktestResult, details: RuleBacktestResult["details"]): RuleBacktestResult {
  const values = details.map((detail) => detail.success);
  const success = values.filter(Boolean).length;
  let currentStreak = 0;
  let maxStreak = 0;
  let running = 0;

  for (const value of values) {
    if (value) {
      running += 1;
      maxStreak = Math.max(maxStreak, running);
    } else {
      running = 0;
    }
  }
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (!values[index]) break;
    currentStreak += 1;
  }

  return {
    ...result,
    total: details.length,
    success,
    failed: details.length - success,
    successRate: details.length ? Number(((success / details.length) * 100).toFixed(2)) : 0,
    currentStreak,
    maxStreak,
    last10: values.slice(-10),
    failedIssues: details.filter((detail) => !detail.success).map((detail) => detail.currentIssue),
    details,
  };
}

function recentRate(result: RuleBacktestResult): number {
  if (!result.last10.length) return result.successRate;
  return Number(((result.last10.filter(Boolean).length / result.last10.length) * 100).toFixed(2));
}

function candidateScore(overall: RuleBacktestResult, training: RuleBacktestResult, validation: RuleBacktestResult): number {
  const formulaTerms = overall.rule.formula.split("+").length;
  const validationWeight = validation.successRate * 0.45;
  const overallWeight = overall.successRate * 0.25;
  const trainingWeight = training.successRate * 0.15;
  const recentWeight = recentRate(overall) * 0.1;
  const stability = Math.max(0, 25 - Math.abs(training.successRate - validation.successRate)) * 0.25;
  const simplicity = Math.max(0, 6 - formulaTerms) * 1.2;
  return Number((validationWeight + overallWeight + trainingWeight + recentWeight + stability + simplicity + overall.currentStreak * 1.4 - overall.failed * 0.12).toFixed(3));
}

export function discoverFormulaCandidates(input: FormulaDiscoveryInput): FormulaDiscoveryCandidate[] {
  const categories = input.categories ?? DEFAULT_CATEGORIES;
  const variablePool = input.variablePool ?? DEFAULT_VARIABLES;
  const maxTerms = Math.max(2, Math.min(input.maxTerms ?? 3, 5));
  const minTrainingRate = input.minTrainingRate ?? 50;
  const minValidationRate = input.minValidationRate ?? 50;
  const { sortedDraws, cut } = splitDraws(input.draws, input.trainRatio ?? 0.7);
  const issueIndex = new Map(sortedDraws.map((draw, index) => [draw.issue, index]));
  const candidates: FormulaDiscoveryCandidate[] = [];
  const targetPoolSize = Math.max(input.limit ?? 20, 20) * 2;

  for (let termCount = 2; termCount <= maxTerms; termCount += 1) {
    const formulas = combinations(variablePool, termCount, termCount).map((items) => items.join(" + "));
    const rules = categories.flatMap((category) => formulas.map((formula, index) => ({ ...makeRule(category, formula, index + termCount * 1000), enabled: true })));
    const batchResults = runBacktest({ draws: sortedDraws, rules, config: input.config }).ruleResults;

    batchResults.forEach((result) => {
      try {
        const span = ruleSpan(result.rule);
        const trainingResult = summarizeResult(result, result.details.filter((detail) => (issueIndex.get(detail.currentIssue) ?? Number.MAX_SAFE_INTEGER) < cut - span));
        const validationResult = summarizeResult(result, result.details.filter((detail) => (issueIndex.get(detail.currentIssue) ?? -1) >= cut - 1));
        if (!result || !trainingResult || !validationResult || result.total === 0 || trainingResult.total === 0 || validationResult.total === 0) return;
        if (trainingResult.successRate < minTrainingRate) return;
        if (validationResult.successRate < minValidationRate) return;
        if (validationResult.successRate + 25 < trainingResult.successRate) return;
        candidates.push({
          ...result,
          rule: { ...result.rule, enabled: false },
          trainingRate: trainingResult.successRate,
          validationRate: validationResult.successRate,
          trainingResult,
          validationResult,
          score: candidateScore(result, trainingResult, validationResult),
        });
      } catch {
        // Invalid combinations are skipped and shown through the remaining ranked results.
      }
    });

    if (candidates.length >= targetPoolSize) break;
  }

  return candidates
    .sort((a, b) => b.score - a.score || b.validationRate - a.validationRate || b.successRate - a.successRate || b.currentStreak - a.currentStreak || a.failed - b.failed)
    .slice(0, input.limit ?? 20);
}
