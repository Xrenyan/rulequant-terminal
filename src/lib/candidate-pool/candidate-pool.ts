import { aggregateZodiacCandidates, buildNumberCandidates } from "@/lib/scoring/scoring-engine";
import { buildRuleSignals } from "@/lib/signal-system/signal-system";
import type { BacktestResult, CandidatePoolReport, DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
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
  return [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
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
