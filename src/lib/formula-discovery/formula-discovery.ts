import { runBacktest } from "@/lib/backtest/run-backtest";
import type { DrawRecord, RuleBacktestResult, RuleCategory, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type FormulaDiscoveryCandidate = RuleBacktestResult & {
  score: number;
  trainingRate: number;
  validationRate: number;
  holdoutRate: number;
  recentRate: number;
  complexity: number;
  stabilityGap: number;
  trainingResult: RuleBacktestResult;
  validationResult: RuleBacktestResult;
  holdoutResult: RuleBacktestResult;
};

export type FormulaDiscoveryInput = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
  limit?: number;
  categories?: RuleCategory[];
  variablePool?: string[];
  maxTerms?: number;
  trainRatio?: number;
  validationRatio?: number;
  minTrainingRate?: number;
  minValidationRate?: number;
  minHoldoutRate?: number;
  minRecentRate?: number;
  maxTrainValidationGap?: number;
  combinationLimitPerTerm?: number;
  orderModes?: Array<"L" | "D">;
  formulaStyles?: Array<"sum" | "alternating" | "subtract_last" | "constant_adjusted">;
};

const DEFAULT_CATEGORIES: RuleCategory[] = ["kill_zodiac", "kill_tail", "kill_sum", "kill_head", "kill_segment", "kill_element"];
const DEFAULT_VARIABLES = ["平1尾", "平2尾", "平2五行值", "平3合", "平4头", "平4波色值", "平5段", "平6尾", "特码合", "特码五行值", "总数尾", "期尾"];
const discoveryCache = new Map<string, FormulaDiscoveryCandidate[]>();

function discoveryCacheKey(input: FormulaDiscoveryInput): string {
  return JSON.stringify({
    draws: input.draws.map((draw) => [draw.issue, draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special]),
    categories: input.categories ?? DEFAULT_CATEGORIES,
    variablePool: input.variablePool ?? DEFAULT_VARIABLES,
    limit: input.limit ?? 20,
    maxTerms: input.maxTerms ?? 3,
    trainRatio: input.trainRatio ?? 0.6,
    validationRatio: input.validationRatio ?? 0.2,
    minTrainingRate: input.minTrainingRate ?? 50,
    minValidationRate: input.minValidationRate ?? 50,
    minHoldoutRate: input.minHoldoutRate ?? 50,
    minRecentRate: input.minRecentRate ?? 50,
    maxTrainValidationGap: input.maxTrainValidationGap ?? 20,
    combinationLimitPerTerm: input.combinationLimitPerTerm ?? 80,
    orderModes: input.orderModes ?? ["L"],
    formulaStyles: input.formulaStyles ?? ["sum"],
    config: input.config,
  });
}

function cloneCandidate(candidate: FormulaDiscoveryCandidate): FormulaDiscoveryCandidate {
  return {
    ...candidate,
    rule: {
      ...candidate.rule,
      positionPattern: [...candidate.rule.positionPattern],
      tags: [...candidate.rule.tags],
      examples: [...candidate.rule.examples],
    },
    last10: [...candidate.last10],
    failedIssues: [...candidate.failedIssues],
    details: candidate.details.map((detail) => ({
      ...detail,
      currentNumbers: [...detail.currentNumbers],
      lOrder: [...detail.lOrder],
      dOrder: [...detail.dOrder],
      variables: { ...detail.variables },
      process: [...detail.process],
      normalizerSteps: [...detail.normalizerSteps],
      finalResult: Array.isArray(detail.finalResult) ? [...detail.finalResult] as number[] | string[] : detail.finalResult,
      mappedResult: [...detail.mappedResult],
      secondaryMappedResult: detail.secondaryMappedResult ? [...detail.secondaryMappedResult] : undefined,
      nextNumbers: detail.nextNumbers ? [...detail.nextNumbers] : undefined,
      nextSpecialAttributes: detail.nextSpecialAttributes ? { ...detail.nextSpecialAttributes } : undefined,
      futureChecks: detail.futureChecks.map((check) => ({ ...check, specialAttributes: { ...check.specialAttributes } })),
    })),
    trainingResult: {
      ...candidate.trainingResult,
      rule: { ...candidate.trainingResult.rule, positionPattern: [...candidate.trainingResult.rule.positionPattern], tags: [...candidate.trainingResult.rule.tags], examples: [...candidate.trainingResult.rule.examples] },
      last10: [...candidate.trainingResult.last10],
      failedIssues: [...candidate.trainingResult.failedIssues],
      details: candidate.trainingResult.details,
    },
    validationResult: {
      ...candidate.validationResult,
      rule: { ...candidate.validationResult.rule, positionPattern: [...candidate.validationResult.rule.positionPattern], tags: [...candidate.validationResult.rule.tags], examples: [...candidate.validationResult.rule.examples] },
      last10: [...candidate.validationResult.last10],
      failedIssues: [...candidate.validationResult.failedIssues],
      details: candidate.validationResult.details,
    },
    holdoutResult: {
      ...candidate.holdoutResult,
      rule: { ...candidate.holdoutResult.rule, positionPattern: [...candidate.holdoutResult.rule.positionPattern], tags: [...candidate.holdoutResult.rule.tags], examples: [...candidate.holdoutResult.rule.examples] },
      last10: [...candidate.holdoutResult.last10],
      failedIssues: [...candidate.holdoutResult.failedIssues],
      details: candidate.holdoutResult.details,
    },
  };
}

export function clearFormulaDiscoveryCache(): void {
  discoveryCache.clear();
}

export function getFormulaDiscoveryCacheSize(): number {
  return discoveryCache.size;
}

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
    case "six_zodiac":
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

function spreadSample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, index) => items[Math.floor((index * items.length) / limit)]);
}

function formulaFor(items: string[], style: NonNullable<FormulaDiscoveryInput["formulaStyles"]>[number], index: number): string {
  if (style === "alternating") {
    return items.map((item, itemIndex) => `${itemIndex === 0 ? "" : itemIndex % 2 ? " - " : " + "}${item}`).join("");
  }
  if (style === "subtract_last" && items.length > 1) {
    return `${items.slice(0, -1).join(" + ")} - ${items.at(-1)}`;
  }
  if (style === "constant_adjusted") {
    const constants = [1, -1, 2, -2, 3, -3];
    const adjustment = constants[index % constants.length];
    return `${items.join(" + ")} ${adjustment > 0 ? "+" : "-"} ${Math.abs(adjustment)}`;
  }
  return items.join(" + ");
}

function formulaComplexity(formula: string): number {
  return formula.split(/[+\-]/).map((item) => item.trim()).filter(Boolean).length;
}

function makeRule(category: RuleCategory, formula: string, index: number, orderMode: "L" | "D"): RuleRecord {
  const now = new Date().toISOString();
  return {
    id: `auto-${category}-${orderMode.toLowerCase()}-${index}`,
    name: `自动筛选 ${index + 1}`,
    category,
    orderMode,
    formula,
    normalizer: normalizerFor(category),
    target: targetFor(category),
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    enabled: false,
    sourceType: "system_recommended",
    participatesInReference: false,
    tags: ["自动筛选", `${orderMode}序`],
    description: "由本地确定性算法按训练期、验证期和独立留出期筛选生成，加入公式库后才参与综合参考结果。",
    sourceFile: "系统自动筛选",
    examples: [],
    createdAt: now,
    updatedAt: now,
  };
}

function splitDraws(draws: DrawRecord[], trainRatio: number, validationRatio: number): { sortedDraws: DrawRecord[]; trainCut: number; validationCut: number } {
  const sorted = [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
  const boundedTrainRatio = Math.min(Math.max(trainRatio, 0.5), 0.7);
  const boundedValidationRatio = Math.min(Math.max(validationRatio, 0.15), 0.25);
  const trainCut = Math.max(3, Math.min(sorted.length - 4, Math.floor(sorted.length * boundedTrainRatio)));
  const validationCut = Math.max(trainCut + 2, Math.min(sorted.length - 2, Math.floor(sorted.length * (boundedTrainRatio + boundedValidationRatio))));
  return {
    sortedDraws: sorted,
    trainCut,
    validationCut,
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

function categoryBaseline(category: RuleCategory): number {
  switch (category) {
    case "kill_zodiac": return 91.67;
    case "kill_tail": return 90;
    case "kill_sum": return 92.3;
    case "kill_head":
    case "kill_element": return 80;
    case "kill_segment": return 85.7;
    default: return 50;
  }
}

function wilsonLowerBound(success: number, total: number): number {
  if (!total) return 0;
  const z = 1.96;
  const rate = success / total;
  const denominator = 1 + (z * z) / total;
  const center = rate + (z * z) / (2 * total);
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * total)) / total);
  return ((center - margin) / denominator) * 100;
}

function candidateScore(
  overall: RuleBacktestResult,
  training: RuleBacktestResult,
  validation: RuleBacktestResult,
  holdout: RuleBacktestResult,
): number {
  const baseline = categoryBaseline(overall.rule.category);
  const recent = recentRate(overall);
  const complexity = formulaComplexity(overall.rule.formula);
  const stableRate = training.successRate * 0.15 + validation.successRate * 0.4 + holdout.successRate * 0.45;
  const stabilityGap = Math.max(
    Math.abs(training.successRate - validation.successRate),
    Math.abs(validation.successRate - holdout.successRate),
    Math.abs(training.successRate - holdout.successRate),
  );
  const confidenceFloor = Math.min(
    wilsonLowerBound(validation.success, validation.total),
    wilsonLowerBound(holdout.success, holdout.total),
  );
  const score = 55
    + (stableRate - baseline) * 2.2
    + (recent - baseline) * 0.35
    + (confidenceFloor - (baseline - 15)) * 0.25
    - stabilityGap * 0.7
    + Math.min(overall.currentStreak, 4) * 0.5
    + Math.max(0, 5 - complexity) * 0.8;
  return Number(Math.max(0, Math.min(100, score)).toFixed(3));
}

export function discoverFormulaCandidates(input: FormulaDiscoveryInput): FormulaDiscoveryCandidate[] {
  const key = discoveryCacheKey(input);
  const cached = discoveryCache.get(key);
  if (cached) return cached.map(cloneCandidate);

  const categories = input.categories ?? DEFAULT_CATEGORIES;
  const variablePool = input.variablePool ?? DEFAULT_VARIABLES;
  const maxTerms = Math.max(2, Math.min(input.maxTerms ?? 3, 5));
  const minTrainingRate = input.minTrainingRate ?? 50;
  const minValidationRate = input.minValidationRate ?? 50;
  const minHoldoutRate = input.minHoldoutRate ?? 50;
  const minRecentRate = input.minRecentRate ?? 50;
  const maxTrainValidationGap = input.maxTrainValidationGap ?? 20;
  const orderModes = input.orderModes?.length ? input.orderModes : ["L" as const];
  const formulaStyles = input.formulaStyles?.length ? input.formulaStyles : ["sum" as const];
  const { sortedDraws, trainCut, validationCut } = splitDraws(input.draws, input.trainRatio ?? 0.6, input.validationRatio ?? 0.2);
  const issueIndex = new Map(sortedDraws.map((draw, index) => [draw.issue, index]));
  const candidates: FormulaDiscoveryCandidate[] = [];
  const targetPoolSize = Math.max(input.limit ?? 20, 20) * 2;
  const combinationLimit = Math.max(20, Math.min(input.combinationLimitPerTerm ?? 80, 160));
  const perDepthLimit = Math.max(6, Math.ceil(targetPoolSize / (maxTerms - 1)));

  for (let termCount = 2; termCount <= maxTerms; termCount += 1) {
    const itemGroups = spreadSample(combinations(variablePool, termCount, termCount), combinationLimit);
    const formulas = itemGroups.flatMap((items, index) => formulaStyles.map((style) => formulaFor(items, style, index)));
    const rules = categories.flatMap((category) => orderModes.flatMap((orderMode) => formulas.map((formula, index) => ({
      ...makeRule(category, formula, index + termCount * 10000, orderMode),
      enabled: true,
    }))));
    const batchResults = runBacktest({ draws: sortedDraws, rules, config: input.config, cache: false }).ruleResults;
    const depthCandidates: FormulaDiscoveryCandidate[] = [];

    batchResults.forEach((result) => {
      try {
        const span = ruleSpan(result.rule);
        const trainingResult = summarizeResult(result, result.details.filter((detail) => (issueIndex.get(detail.currentIssue) ?? Number.MAX_SAFE_INTEGER) + span < trainCut));
        const validationResult = summarizeResult(result, result.details.filter((detail) => {
          const index = issueIndex.get(detail.currentIssue) ?? -1;
          return index >= trainCut - span && index + span < validationCut;
        }));
        const holdoutResult = summarizeResult(result, result.details.filter((detail) => (issueIndex.get(detail.currentIssue) ?? -1) >= validationCut - span));
        if (!result || result.total === 0 || trainingResult.total === 0 || validationResult.total === 0 || holdoutResult.total === 0) return;
        if (trainingResult.successRate < minTrainingRate) return;
        if (validationResult.successRate < minValidationRate) return;
        if (holdoutResult.successRate < minHoldoutRate) return;
        const recent = recentRate(result);
        if (recent < minRecentRate) return;
        const stabilityGap = Math.max(
          Math.abs(trainingResult.successRate - validationResult.successRate),
          Math.abs(validationResult.successRate - holdoutResult.successRate),
          Math.abs(trainingResult.successRate - holdoutResult.successRate),
        );
        if (stabilityGap > maxTrainValidationGap) return;
        depthCandidates.push({
          ...result,
          rule: { ...result.rule, enabled: false },
          trainingRate: trainingResult.successRate,
          validationRate: validationResult.successRate,
          holdoutRate: holdoutResult.successRate,
          recentRate: recent,
          complexity: formulaComplexity(result.rule.formula),
          stabilityGap: Number(stabilityGap.toFixed(2)),
          trainingResult,
          validationResult,
          holdoutResult,
          score: candidateScore(result, trainingResult, validationResult, holdoutResult),
        });
      } catch {
        // Invalid combinations are skipped and shown through the remaining ranked results.
      }
    });
    depthCandidates
      .sort((a, b) => b.score - a.score || b.holdoutRate - a.holdoutRate || b.validationRate - a.validationRate || a.stabilityGap - b.stabilityGap)
      .slice(0, perDepthLimit)
      .forEach((candidate) => candidates.push(candidate));
  }

  const sortedCandidates = candidates.sort((a, b) => b.score - a.score || b.holdoutRate - a.holdoutRate || b.validationRate - a.validationRate || b.successRate - a.successRate || a.stabilityGap - b.stabilityGap || a.failed - b.failed);
  const selected = new Map<string, FormulaDiscoveryCandidate>();
  for (let termCount = 2; termCount <= maxTerms; termCount += 1) {
    const candidate = sortedCandidates.find((item) => item.complexity === termCount);
    if (candidate) selected.set(candidate.rule.id, candidate);
  }
  for (const candidate of sortedCandidates) {
    if (selected.size >= (input.limit ?? 20)) break;
    selected.set(candidate.rule.id, candidate);
  }
  const result = [...selected.values()]
    .sort((a, b) => b.score - a.score || b.holdoutRate - a.holdoutRate || a.stabilityGap - b.stabilityGap)
    .slice(0, input.limit ?? 20);
  discoveryCache.set(key, result.map(cloneCandidate));
  return result.map(cloneCandidate);
}
