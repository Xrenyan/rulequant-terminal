import { aggregateZodiacCandidates, buildNumberCandidates } from "@/lib/scoring/scoring-engine";
import { buildRuleSignals, buildRuleSignalsFromBacktest } from "@/lib/signal-system/signal-system";
import { getNumberAttributes, normalizeDraw } from "@/lib/engine/attributes";
import { runBacktest } from "@/lib/backtest/run-backtest";
import type { BacktestDetail, BacktestResult, CandidateNumber, CandidatePoolReport, DrawRecord, ReferenceObservationReport, RuleQuantConfig, RuleRecord, RuleSignal } from "@/types/domain";
import type { RuleValidationSummary } from "@/lib/rules/rule-validation";
import { collapseIdenticalRuleOutputs } from "@/lib/candidate-pool/signal-output-groups";
import { FORMULA_ANALYSIS_WINDOWS, normalizeFormulaAnalysisWindow } from "@/lib/formula-analysis/windows";

type GenerateCandidatePoolInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  backtest?: BacktestResult;
  validationSummaries?: RuleValidationSummary[];
  signals?: RuleSignal[];
  cache?: boolean;
};

const RISK_NOTICE = "综合参考结果仅用于历史数据研究、规则公式计算和参考排序，不代表一定正确。";
export const REFERENCE_OBSERVATION_WINDOWS = FORMULA_ANALYSIS_WINDOWS;
const candidatePoolCache = new Map<string, CandidatePoolReport>();
const CANDIDATE_POOL_CACHE_LIMIT = 32;

function compareIssues(a: string, b: string): number {
  const aNumber = /^\d+$/.test(a) ? Number(a) : undefined;
  const bNumber = /^\d+$/.test(b) ? Number(b) : undefined;
  if (aNumber !== undefined && bNumber !== undefined) return aNumber - bNumber;
  if (aNumber !== undefined) return 1;
  if (bNumber !== undefined) return -1;
  return a.localeCompare(b, "zh-CN", { numeric: true });
}

function sortDraws(draws: DrawRecord[]): DrawRecord[] {
  return [...draws].sort((a, b) => compareIssues(a.issue, b.issue));
}

function candidateCacheKey(input: GenerateCandidatePoolInput): string {
  return JSON.stringify({
    draws: input.draws.map((draw) => [draw.issue, draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special]),
    rules: input.rules.map((rule) => [
      rule.id,
      rule.updatedAt,
      rule.enabled,
      rule.participatesInReference,
      rule.sourceType,
      rule.category,
      rule.orderMode,
      rule.formula,
      rule.normalizer,
      rule.target,
      rule.positionPattern,
      rule.anchorIssue ?? "",
      rule.anchorPatternIndex ?? "",
      rule.periodSpan,
      rule.verifyOffset ?? 1,
    ]),
    validation: input.validationSummaries?.map((summary) => [summary.ruleId, summary.canJoinReference, summary.status]) ?? [],
    backtest: input.backtest?.ruleResults.map((result) => [result.rule.id, result.successRate, result.currentStreak, result.last10]) ?? [],
    signals: input.signals?.map((signal) => [signal.ruleId, signal.action, signal.targetType, signal.targets, signal.weight]) ?? [],
    config: input.config,
  });
}

export function clearCandidatePoolCache(): void {
  candidatePoolCache.clear();
}

export function getCandidatePoolCacheSize(): number {
  return candidatePoolCache.size;
}

export function compactReferenceObservationBacktest(backtest: BacktestResult): BacktestResult {
  return {
    generatedAt: backtest.generatedAt,
    ruleResults: backtest.ruleResults.map((result) => ({
      ...result,
      failedIssues: [],
      details: result.details.map((detail) => ({
        ruleId: detail.ruleId,
        ruleName: detail.ruleName,
        currentIssue: detail.currentIssue,
        currentNumbers: [],
        lOrder: [],
        dOrder: [],
        formula: "",
        variables: {},
        expression: "",
        process: [],
        rawResult: 0,
        normalizerSteps: [],
        finalResult: 0,
        mappedResult: [...detail.mappedResult],
        secondaryMappedResult: detail.secondaryMappedResult ? [...detail.secondaryMappedResult] : undefined,
        targetLabel: "",
        nextIssue: detail.futureChecks.at(-1)?.issue ?? detail.nextIssue,
        futureChecks: [],
        success: detail.success,
      })),
    })),
  };
}

function focusedNumberScore(candidate: CandidateNumber): number {
  const strongSupportRules = candidate.supportRules.filter((rule) => rule.scoreDelta >= 0.45);
  const strongSupportWeight = strongSupportRules.reduce((sum, rule) => sum + rule.scoreDelta, 0);
  const opposeWeight = candidate.opposeRules.reduce((sum, rule) => sum + Math.abs(rule.scoreDelta), 0);
  const netEvidence = candidate.supportCount - candidate.opposeCount;

  return Number((
    candidate.score
    + strongSupportRules.length * 0.7
    + strongSupportWeight * 0.22
    + Math.min(netEvidence, 12) * 0.08
    - candidate.opposeCount * 0.45
    - opposeWeight * 0.12
  ).toFixed(3));
}

function focusedNumbers(candidates: CandidateNumber[], count: number): CandidateNumber[] {
  const ranked = [...candidates].sort((a, b) => {
    const scoreDiff = focusedNumberScore(b) - focusedNumberScore(a);
    if (scoreDiff) return scoreDiff;
    return b.score - a.score || b.supportCount - a.supportCount || a.opposeCount - b.opposeCount || a.number - b.number;
  });
  const preferred = ranked.filter((candidate) => candidate.opposeCount === 0 || candidate.supportCount >= candidate.opposeCount * 2);
  const result: CandidateNumber[] = [];

  [...preferred, ...ranked].forEach((candidate) => {
    if (result.length >= count) return;
    if (result.some((item) => item.number === candidate.number)) return;
    result.push(candidate);
  });

  return result;
}

export function generateCandidatePool(input: GenerateCandidatePoolInput): CandidatePoolReport {
  const key = input.cache === false ? "" : candidateCacheKey(input);
  const cached = key ? candidatePoolCache.get(key) : undefined;
  if (cached) {
    candidatePoolCache.delete(key);
    candidatePoolCache.set(key, cached);
    return cached;
  }

  const sortedDraws = sortDraws(input.draws);
  const latestDraw = sortedDraws.at(-1);
  const signals = input.signals ?? buildRuleSignals(input);
  const allNumbers = buildNumberCandidates(input.config, signals);
  const allZodiacs = aggregateZodiacCandidates(input.config, allNumbers);
  const participatingRuleIds = new Set(signals.map((signal) => signal.ruleId));
  const evidencedNumbers = allNumbers.filter((candidate) => candidate.supportCount + candidate.opposeCount > 0);
  const evidencedZodiacs = allZodiacs.filter((candidate) => candidate.supportCount + candidate.opposeCount > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    latestIssue: latestDraw?.issue,
    latestDate: latestDraw?.date,
    latestNumbers: latestDraw ? [latestDraw.n1, latestDraw.n2, latestDraw.n3, latestDraw.n4, latestDraw.n5, latestDraw.n6, latestDraw.special] : [],
    ruleCount: participatingRuleIds.size,
    signalCount: signals.length,
    signals,
    allNumbers,
    allZodiacs,
    topNumbers8: signals.length ? focusedNumbers(evidencedNumbers, 8) : [],
    topNumbers12: signals.length ? focusedNumbers(evidencedNumbers, 12) : [],
    topNumbers16: signals.length ? evidencedNumbers.slice(0, 16) : [],
    topNumbers18: signals.length ? evidencedNumbers.slice(0, 18) : [],
    topZodiacs7: signals.length ? evidencedZodiacs.slice(0, 7) : [],
    topZodiacs8: signals.length ? evidencedZodiacs.slice(0, 8) : [],
    topZodiacs9: signals.length ? evidencedZodiacs.slice(0, 9) : [],
    riskNotice: RISK_NOTICE,
  };

  if (key) {
    candidatePoolCache.set(key, report);
    while (candidatePoolCache.size > CANDIDATE_POOL_CACHE_LIMIT) {
      const oldestKey = candidatePoolCache.keys().next().value;
      if (!oldestKey) break;
      candidatePoolCache.delete(oldestKey);
    }
  }
  return report;
}

function rate(hits: number, total: number): number {
  return total ? Number(((hits / total) * 100).toFixed(2)) : 0;
}

function detailKnownByIssue(detail: BacktestDetail, knownIssue: string): boolean {
  if (detail.futureChecks.length) {
    return detail.futureChecks.every((check) => compareIssues(check.issue, knownIssue) <= 0);
  }
  if (detail.nextIssue) return compareIssues(detail.nextIssue, knownIssue) <= 0;
  return compareIssues(detail.currentIssue, knownIssue) < 0;
}

function createHistoricalBacktestSnapshotter(backtest: BacktestResult): (knownIssue: string) => BacktestResult {
  const states = backtest.ruleResults.map((result) => ({
    result,
    cursor: 0,
    success: 0,
    currentStreak: 0,
    maxStreak: 0,
    recentValues: [] as boolean[],
  }));

  return (knownIssue: string) => ({
    generatedAt: backtest.generatedAt,
    ruleResults: states.map((state) => {
      while (state.cursor < state.result.details.length && detailKnownByIssue(state.result.details[state.cursor], knownIssue)) {
        const value = state.result.details[state.cursor].success;
        state.cursor += 1;
        if (value) {
          state.success += 1;
          state.currentStreak += 1;
          state.maxStreak = Math.max(state.maxStreak, state.currentStreak);
        } else {
          state.currentStreak = 0;
        }
        state.recentValues.push(value);
        if (state.recentValues.length > 10) state.recentValues.shift();
      }

      return {
        ...state.result,
        total: state.cursor,
        success: state.success,
        failed: state.cursor - state.success,
        successRate: state.cursor ? Number(((state.success / state.cursor) * 100).toFixed(2)) : 0,
        currentStreak: state.currentStreak,
        maxStreak: state.maxStreak,
        last10: [...state.recentValues],
        failedIssues: [],
        details: [],
      };
    }),
  });
}

export function buildReferenceObservation(input: GenerateCandidatePoolInput & { window?: number; collapseIdenticalOutputs?: boolean }): ReferenceObservationReport {
  const sortedDraws = sortDraws(input.draws);
  const windowSize = normalizeFormulaAnalysisWindow(input.window);
  const startIndex = Math.max(1, sortedDraws.length - windowSize);
  const fullBacktest = input.backtest ?? runBacktest({ draws: sortedDraws, rules: input.rules, config: input.config });
  const historicalBacktestAt = createHistoricalBacktestSnapshotter(fullBacktest);
  const calculationDetailIndex = new Map(fullBacktest.ruleResults.map((result) => [
    result.rule.id,
    new Map(result.details.map((detail) => [detail.currentIssue, detail])),
  ]));
  const items = sortedDraws.slice(startIndex).flatMap((targetDraw, offset) => {
    const targetIndex = startIndex + offset;
    const previousDraw = sortedDraws[targetIndex - 1];
    const priorDraws = sortedDraws.slice(0, targetIndex);
    if (!previousDraw || priorDraws.length < 2) return [];
    const historicalBacktest = historicalBacktestAt(previousDraw.issue);

    const historicalSignals = buildRuleSignalsFromBacktest({
      rules: input.rules,
      backtest: historicalBacktest,
      calculationBacktest: fullBacktest,
      currentIssue: previousDraw.issue,
      fallbackCurrent: normalizeDraw(previousDraw, input.config),
      fallbackConfig: input.config,
      fallbackPeriodIndex: targetIndex - 1,
      calculationDetailIndex,
      validationSummaries: input.validationSummaries,
    });
    const report = generateCandidatePool({
      draws: priorDraws,
      rules: input.rules,
      config: input.config,
      backtest: historicalBacktest,
      validationSummaries: input.validationSummaries,
      cache: false,
      signals: input.collapseIdenticalOutputs ? collapseIdenticalRuleOutputs(historicalSignals, input.rules) : historicalSignals,
    });
    const attributes = getNumberAttributes(targetDraw.special, input.config);
    const top8Numbers = report.topNumbers8.map((candidate) => candidate.number);
    const top12Numbers = report.topNumbers12.map((candidate) => candidate.number);
    const top18Numbers = report.topNumbers18.map((candidate) => candidate.number);
    const top7Zodiacs = report.topZodiacs7.map((candidate) => candidate.zodiac);
    const top9Zodiacs = report.topZodiacs9.map((candidate) => candidate.zodiac);
    const hitNumberRank = Math.max(1, report.allNumbers.findIndex((candidate) => candidate.number === targetDraw.special) + 1);

    return [{
      issue: targetDraw.issue,
      previousIssue: previousDraw.issue,
      special: targetDraw.special,
      zodiac: attributes.zodiac,
      top8Numbers,
      top12Numbers,
      top18Numbers,
      top7Zodiacs,
      top9Zodiacs,
      hitTop8: top8Numbers.includes(targetDraw.special),
      hitTop12: top12Numbers.includes(targetDraw.special),
      hitTop18: top18Numbers.includes(targetDraw.special),
      hitZodiac7: top7Zodiacs.includes(attributes.zodiac),
      hitZodiac9: top9Zodiacs.includes(attributes.zodiac),
      hitNumberRank,
      ruleCount: report.ruleCount,
      signalCount: report.signalCount,
    }];
  });

  const top8Hits = items.filter((item) => item.hitTop8).length;
  const top12Hits = items.filter((item) => item.hitTop12).length;
  const top18Hits = items.filter((item) => item.hitTop18).length;
  const zodiac7Hits = items.filter((item) => item.hitZodiac7).length;
  const zodiac9Hits = items.filter((item) => item.hitZodiac9).length;

  return {
    window: windowSize,
    total: items.length,
    top8Hits,
    top12Hits,
    top18Hits,
    zodiac7Hits,
    zodiac9Hits,
    top8Rate: rate(top8Hits, items.length),
    top12Rate: rate(top12Hits, items.length),
    top18Rate: rate(top18Hits, items.length),
    zodiac7Rate: rate(zodiac7Hits, items.length),
    zodiac9Rate: rate(zodiac9Hits, items.length),
    items,
  };
}
