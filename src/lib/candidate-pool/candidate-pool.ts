import { aggregateZodiacCandidates, buildNumberCandidates } from "@/lib/scoring/scoring-engine";
import { buildRuleSignals } from "@/lib/signal-system/signal-system";
import { getNumberAttributes } from "@/lib/engine/attributes";
import { runBacktest } from "@/lib/backtest/run-backtest";
import type { BacktestDetail, BacktestResult, CandidateNumber, CandidatePoolReport, DrawRecord, ReferenceObservationReport, RuleBacktestResult, RuleQuantConfig, RuleRecord } from "@/types/domain";
import type { RuleValidationSummary } from "@/lib/rules/rule-validation";

type GenerateCandidatePoolInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  backtest?: BacktestResult;
  validationSummaries?: RuleValidationSummary[];
};

const RISK_NOTICE = "综合参考结果仅用于历史数据研究、规则公式计算和参考排序，不代表一定正确。";
const candidatePoolCache = new Map<string, CandidatePoolReport>();

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
    config: input.config,
  });
}

export function clearCandidatePoolCache(): void {
  candidatePoolCache.clear();
}

export function getCandidatePoolCacheSize(): number {
  return candidatePoolCache.size;
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
  const key = candidateCacheKey(input);
  const cached = candidatePoolCache.get(key);
  if (cached) return cached;

  const sortedDraws = sortDraws(input.draws);
  const latestDraw = sortedDraws.at(-1);
  const signals = buildRuleSignals(input);
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

  candidatePoolCache.set(key, report);
  return report;
}

function rate(hits: number, total: number): number {
  return total ? Number(((hits / total) * 100).toFixed(2)) : 0;
}

function detailKnownByIssue(detail: BacktestDetail, knownIssue: string): boolean {
  if (detail.futureChecks.length) {
    return detail.futureChecks.every((check) => check.issue.localeCompare(knownIssue, "zh-CN", { numeric: true }) <= 0);
  }
  if (detail.nextIssue) return detail.nextIssue.localeCompare(knownIssue, "zh-CN", { numeric: true }) <= 0;
  return detail.currentIssue.localeCompare(knownIssue, "zh-CN", { numeric: true }) < 0;
}

function streak(values: boolean[]): { current: number; max: number } {
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

  let current = 0;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (!values[index]) break;
    current += 1;
  }

  return { current, max };
}

function summarizeRuleBacktest(ruleResult: RuleBacktestResult, knownIssue: string): RuleBacktestResult {
  const details = ruleResult.details.filter((detail) => detailKnownByIssue(detail, knownIssue));
  const values = details.map((detail) => detail.success);
  const success = values.filter(Boolean).length;
  const streaks = streak(values);

  return {
    ...ruleResult,
    total: details.length,
    success,
    failed: details.length - success,
    successRate: details.length ? Number(((success / details.length) * 100).toFixed(2)) : 0,
    currentStreak: streaks.current,
    maxStreak: streaks.max,
    last10: values.slice(-10),
    failedIssues: details.filter((detail) => !detail.success).map((detail) => detail.currentIssue),
    details,
  };
}

function backtestKnownByIssue(backtest: BacktestResult, knownIssue: string): BacktestResult {
  return {
    generatedAt: backtest.generatedAt,
    ruleResults: backtest.ruleResults.map((ruleResult) => summarizeRuleBacktest(ruleResult, knownIssue)),
  };
}

export function buildReferenceObservation(input: GenerateCandidatePoolInput & { window?: number }): ReferenceObservationReport {
  const sortedDraws = sortDraws(input.draws);
  const windowSize = input.window ?? 10;
  const startIndex = Math.max(1, sortedDraws.length - windowSize);
  const fullBacktest = input.backtest ?? runBacktest({ draws: sortedDraws, rules: input.rules, config: input.config });
  const items = sortedDraws.slice(startIndex).flatMap((targetDraw, offset) => {
    const targetIndex = startIndex + offset;
    const previousDraw = sortedDraws[targetIndex - 1];
    const priorDraws = sortedDraws.slice(0, targetIndex);
    if (!previousDraw || priorDraws.length < 2) return [];

    const report = generateCandidatePool({
      draws: priorDraws,
      rules: input.rules,
      config: input.config,
      backtest: backtestKnownByIssue(fullBacktest, previousDraw.issue),
      validationSummaries: input.validationSummaries,
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
