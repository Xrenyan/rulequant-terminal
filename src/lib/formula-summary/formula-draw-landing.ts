import type { RuleQuantConfig } from "@/types/domain";
import type {
  FormulaSummaryAction,
  FormulaSummaryContribution,
  FormulaSummaryPeriod,
  FormulaSummaryTarget,
  FormulaSummaryTargetResult,
  FormulaSummaryTargetType,
} from "./formula-summary";

export type FormulaLandingDomainItem = {
  target: FormulaSummaryTarget;
  targetKey: string;
  label: string;
};

export type FormulaLandingSeries = FormulaLandingDomainItem & {
  total: number;
  values: number[];
  ranks: number[];
};

export type FormulaDrawLandingRecord = {
  calculationIssue: string;
  targetIssue: string;
  specialNumber: number;
  actualTarget: FormulaSummaryTarget;
  actualTargetKey: string;
  actualLabel: string;
  count: number;
  rank: number;
  tieCount: number;
  rankLabel: string;
  contributions: FormulaSummaryContribution[];
};

export type FormulaLandingKpis = {
  averageCount: number;
  topThreePeriods: number;
  averageRank: number;
  maxCount: number;
};

export type FormulaDrawLandingAnalysis = {
  domain: FormulaLandingDomainItem[];
  matrixPeriods: FormulaSummaryPeriod[];
  series: FormulaLandingSeries[];
  records: FormulaDrawLandingRecord[];
  pendingPeriod?: FormulaSummaryPeriod;
  retainedMatrixIssue?: string;
  kpis: FormulaLandingKpis;
  insight: string;
  globalMax: number;
  warningCount: number;
};

export type FormulaDrawLandingInput = {
  periods: FormulaSummaryPeriod[];
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  config: RuleQuantConfig;
  completedLimit?: number;
  matrixLimit?: number;
  focusedCalculationIssue?: string;
};

const DEFAULT_COMPLETED_LIMIT = 10;
const DEFAULT_MATRIX_LIMIT = 10;

export function formulaTargetKey(target: FormulaSummaryTarget): string {
  return `${typeof target}:${String(target)}`;
}

function domainItem(target: FormulaSummaryTarget, label = String(target)): FormulaLandingDomainItem {
  return { target, targetKey: formulaTargetKey(target), label };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function buildFormulaTargetDomain(
  targetType: FormulaSummaryTargetType,
  config: RuleQuantConfig,
): FormulaLandingDomainItem[] {
  const halfHeads = Array.from({ length: 5 }, (_, head) =>
    (["单", "双"] as const).map((parity) => `${head}头${parity}`),
  ).flat();
  const halfColors = Object.keys(config.colorTable).flatMap((color) => [
    `${color}波单`,
    `${color}波双`,
  ]);
  const doors = Array.from({ length: 5 }, (_, index) => `${index + 1}门`);

  switch (targetType) {
    case "zodiac":
      return config.zodiacOrder.map((target) => domainItem(target));
    case "tail":
      return range(0, 9).map((target) => domainItem(target));
    case "head":
      return range(0, 4).map((target) => domainItem(target));
    case "sum":
      return range(1, 13).map((target) => domainItem(target));
    case "segment":
      return config.segmentRanges.map(({ label }) => domainItem(label));
    case "element":
      return Object.keys(config.elementTable).map((target) => domainItem(target));
    case "color":
      return Object.keys(config.colorTable).map((target) => domainItem(target));
    case "half-head":
      return halfHeads.map((target) => domainItem(target));
    case "half-color":
      return halfColors.map((target) => domainItem(target));
    case "door":
      return doors.map((target) => domainItem(target));
    case "number":
      return range(1, 49).map((target) => domainItem(target, String(target).padStart(2, "0")));
  }
}

function resolveDoor(number: number): string {
  if (number <= 9) return "1门";
  if (number <= 18) return "2门";
  if (number <= 27) return "3门";
  if (number <= 37) return "4门";
  return "5门";
}

export function resolveFormulaActualTarget(
  result: FormulaSummaryTargetResult,
  targetType: FormulaSummaryTargetType,
): FormulaLandingDomainItem {
  switch (targetType) {
    case "zodiac":
      return domainItem(result.zodiac);
    case "tail":
      return domainItem(result.tail);
    case "head":
      return domainItem(result.head);
    case "sum":
      return domainItem(result.sum);
    case "segment":
      return domainItem(result.segment);
    case "element":
      return domainItem(result.element);
    case "color":
      return domainItem(result.color);
    case "half-head":
      return domainItem(`${result.head}头${result.parity}`);
    case "half-color":
      return domainItem(`${result.color}波${result.parity}`);
    case "door":
      return domainItem(resolveDoor(result.number));
    case "number":
      return domainItem(result.number);
  }
}

function requestedLimit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? fallback)) : fallback;
}

function newestWindow<T>(items: T[], limit: number): T[] {
  return items.slice(Math.max(items.length - limit, 0));
}

function countsForPeriod(
  period: FormulaSummaryPeriod,
  action: FormulaSummaryAction,
  targetType: FormulaSummaryTargetType,
): Map<string, FormulaSummaryContribution[]> {
  const counts = new Map<string, FormulaSummaryContribution[]>();
  const contributions = period.contributions.filter((contribution) => (
    contribution.action === action && contribution.targetType === targetType
  ));

  for (const contribution of contributions) {
    const uniqueKeys = new Set<string>();
    for (const target of contribution.targets) {
      const targetKey = formulaTargetKey(target);
      if (uniqueKeys.has(targetKey)) continue;
      uniqueKeys.add(targetKey);
      const entries = counts.get(targetKey);
      if (entries) entries.push(contribution);
      else counts.set(targetKey, [contribution]);
    }
  }

  return counts;
}

function countFor(counts: Map<string, FormulaSummaryContribution[]>, targetKey: string): number {
  return counts.get(targetKey)?.length ?? 0;
}

function rankFor(
  domain: FormulaLandingDomainItem[],
  counts: Map<string, FormulaSummaryContribution[]>,
  targetKey: string,
): { count: number; rank: number; tieCount: number; rankLabel: string } {
  const count = countFor(counts, targetKey);
  const rank = 1 + domain.filter((candidate) => countFor(counts, candidate.targetKey) > count).length;
  const tieCount = domain.filter((candidate) => countFor(counts, candidate.targetKey) === count).length;
  return {
    count,
    rank,
    tieCount,
    rankLabel: tieCount > 1 ? `并列第 ${rank} 位` : `第 ${rank} 位`,
  };
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildFormulaDrawLandingAnalysis(
  input: FormulaDrawLandingInput,
): FormulaDrawLandingAnalysis {
  const completedLimit = requestedLimit(input.completedLimit, DEFAULT_COMPLETED_LIMIT);
  const matrixLimit = requestedLimit(input.matrixLimit, DEFAULT_MATRIX_LIMIT);
  const domain = buildFormulaTargetDomain(input.targetType, input.config);
  const defaultMatrixPeriods = newestWindow(input.periods, matrixLimit);
  const focusedMatrixPeriod = input.focusedCalculationIssue && input.focusedCalculationIssue !== "all"
    ? input.periods.find((period) => period.calculationIssue === input.focusedCalculationIssue)
    : undefined;
  const retainedMatrixIssue = focusedMatrixPeriod && !defaultMatrixPeriods.includes(focusedMatrixPeriod)
    ? focusedMatrixPeriod.calculationIssue
    : undefined;
  const matrixPeriods = retainedMatrixIssue
    ? input.periods.filter((period) => period.calculationIssue === retainedMatrixIssue || defaultMatrixPeriods.includes(period))
    : defaultMatrixPeriods;
  const countsByPeriod = matrixPeriods.map((period) => (
    countsForPeriod(period, input.action, input.targetType)
  ));
  const series = domain.map((item) => {
    const values = countsByPeriod.map((counts) => countFor(counts, item.targetKey));
    const ranks = countsByPeriod.map((counts) => rankFor(domain, counts, item.targetKey).rank);
    return { ...item, total: values.reduce((total, value) => total + value, 0), values, ranks };
  });

  const completedPeriods = input.periods.filter((period) => period.targetResult);
  const records = newestWindow(completedPeriods, completedLimit).map((period) => {
    const result = period.targetResult!;
    const actualTarget = resolveFormulaActualTarget(result, input.targetType);
    const counts = countsForPeriod(period, input.action, input.targetType);
    const ranking = rankFor(domain, counts, actualTarget.targetKey);
    return {
      calculationIssue: period.calculationIssue,
      targetIssue: period.targetIssue ?? result.issue,
      specialNumber: result.number,
      actualTarget: actualTarget.target,
      actualTargetKey: actualTarget.targetKey,
      actualLabel: actualTarget.label,
      count: ranking.count,
      rank: ranking.rank,
      tieCount: ranking.tieCount,
      rankLabel: ranking.rankLabel,
      contributions: counts.get(actualTarget.targetKey) ?? [],
    };
  });
  const pendingPeriod = [...input.periods].reverse().find((period) => period.isPending);
  const warningCount = input.periods.filter((period) => period.targetResultWarning !== undefined).length;
  const averageCount = records.length
    ? roundOneDecimal(records.reduce((total, record) => total + record.count, 0) / records.length)
    : 0;
  const topThreePeriods = records.filter((record) => record.rank <= 3).length;
  const averageRank = records.length
    ? roundOneDecimal(records.reduce((total, record) => total + record.rank, 0) / records.length)
    : 0;
  const maxCount = records.reduce((maximum, record) => Math.max(maximum, record.count), 0);
  const kpis = { averageCount, topThreePeriods, averageRank, maxCount };
  const actionCopy = input.action === "exclude" ? "被排除" : "被支持";
  const latest = records.at(-1);
  const insight = latest
    ? `最近${records.length}个已开奖期中，实际开奖落点平均${actionCopy}次数为${averageCount}次，${topThreePeriods}期落在前三位；最近一期实际开奖落点为${latest.actualLabel}，${actionCopy}次数为${latest.count}次，${latest.rankLabel}。`
    : "当前暂无已开奖期可验证实际结果。";
  const globalMax = series.reduce((maximum, item) => (
    Math.max(maximum, ...item.values)
  ), 0);

  return {
    domain,
    matrixPeriods,
    series,
    records,
    pendingPeriod,
    retainedMatrixIssue,
    kpis,
    insight,
    globalMax,
    warningCount,
  };
}
