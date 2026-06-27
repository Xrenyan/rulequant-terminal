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

function combinations(items: string[], maxTerms: number): string[][] {
  const output: string[][] = [];
  function walk(start: number, current: string[]) {
    if (current.length >= 2) output.push([...current]);
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

function splitDraws(draws: DrawRecord[], ratio: number): { trainingDraws: DrawRecord[]; validationDraws: DrawRecord[] } {
  const sorted = [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
  const boundedRatio = Math.min(Math.max(ratio, 0.5), 0.85);
  const cut = Math.max(3, Math.min(sorted.length - 2, Math.floor(sorted.length * boundedRatio)));
  return {
    trainingDraws: sorted.slice(0, cut),
    validationDraws: sorted.slice(Math.max(0, cut - 1)),
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
  const { trainingDraws, validationDraws } = splitDraws(input.draws, input.trainRatio ?? 0.7);
  const formulas = combinations(variablePool, maxTerms).map((items) => items.join(" + "));
  const rules = categories.flatMap((category) => formulas.map((formula, index) => makeRule(category, formula, index)));
  const candidates: FormulaDiscoveryCandidate[] = [];

  rules.forEach((rule) => {
    try {
      const enabledRule = { ...rule, enabled: true };
      const trainingResult = runBacktest({ draws: trainingDraws, rules: [enabledRule], config: input.config }).ruleResults[0];
      const validationResult = runBacktest({ draws: validationDraws, rules: [enabledRule], config: input.config }).ruleResults[0];
      const result = runBacktest({ draws: input.draws, rules: [enabledRule], config: input.config }).ruleResults[0];
      if (!result || !trainingResult || !validationResult || result.total === 0 || trainingResult.total === 0 || validationResult.total === 0) return;
      if (trainingResult.successRate < minTrainingRate) return;
      if (validationResult.successRate < minValidationRate) return;
      if (validationResult.successRate + 25 < trainingResult.successRate) return;
      candidates.push({
        ...result,
        rule,
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

  return candidates
    .sort((a, b) => b.score - a.score || b.validationRate - a.validationRate || b.successRate - a.successRate || b.currentStreak - a.currentStreak || a.failed - b.failed)
    .slice(0, input.limit ?? 20);
}
