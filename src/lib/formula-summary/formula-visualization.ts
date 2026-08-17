import type {
  FormulaSummaryAction,
  FormulaSummaryContribution,
  FormulaSummaryPeriod,
  FormulaSummaryTarget,
  FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";

export type FormulaVisualizationSeries = {
  target: FormulaSummaryTarget;
  targetKey: string;
  label: string;
  total: number;
  values: number[];
  ranks: number[];
};

export type FormulaVisualizationModel = {
  calculationIssues: string[];
  targetLabels: string[];
  series: FormulaVisualizationSeries[];
  medianValues: number[];
  leaderValues: number[];
  leaderLabels: string[];
  globalMax: number;
};

export type FormulaParetoRow = {
  id: string;
  label: string;
  count: number;
  cumulativeShare: number;
  isRemainder: boolean;
};

function keyForTarget(target: FormulaSummaryTarget): string {
  return `${typeof target}:${String(target)}`;
}

function compareLabel(a: string, b: string): number {
  return a.localeCompare(b, "zh-CN", { numeric: true });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildFormulaVisualizationModel(
  periods: FormulaSummaryPeriod[],
  action: FormulaSummaryAction,
  targetType: FormulaSummaryTargetType,
): FormulaVisualizationModel {
  const periodCounts: Array<Map<string, { target: FormulaSummaryTarget; count: number }>> = [];
  const targets = new Map<string, FormulaSummaryTarget>();

  for (const period of periods) {
    const counts = new Map<string, { target: FormulaSummaryTarget; count: number }>();
    for (const contribution of period.contributions) {
      if (contribution.action !== action || contribution.targetType !== targetType) continue;
      const uniqueTargets = new Map(contribution.targets.map((target) => [keyForTarget(target), target]));
      for (const [targetKey, target] of uniqueTargets) {
        targets.set(targetKey, target);
        const current = counts.get(targetKey);
        counts.set(targetKey, { target, count: (current?.count ?? 0) + 1 });
      }
    }
    periodCounts.push(counts);
  }

  const series = [...targets.entries()].map(([targetKey, target]) => {
    const values = periodCounts.map((counts) => counts.get(targetKey)?.count ?? 0);
    return {
      target,
      targetKey,
      label: String(target),
      total: values.reduce((sum, value) => sum + value, 0),
      values,
      ranks: [] as number[],
    };
  }).sort((a, b) => b.total - a.total || compareLabel(a.label, b.label));

  for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
    const ranked = [...series].sort((a, b) => (
      b.values[periodIndex] - a.values[periodIndex]
      || compareLabel(a.label, b.label)
    ));
    let rank = 0;
    let previousValue: number | undefined;
    ranked.forEach((item, index) => {
      const value = item.values[periodIndex];
      if (previousValue === undefined || value !== previousValue) rank = index + 1;
      item.ranks[periodIndex] = rank;
      previousValue = value;
    });
  }

  const leaderValues = periods.map((_, periodIndex) => (
    Math.max(0, ...series.map((item) => item.values[periodIndex]))
  ));
  const leaderLabels = periods.map((_, periodIndex) => {
    const leaderValue = leaderValues[periodIndex];
    return series.find((item) => item.values[periodIndex] === leaderValue)?.label ?? "—";
  });
  const medianValues = periods.map((_, periodIndex) => (
    median(series.map((item) => item.values[periodIndex]))
  ));

  return {
    calculationIssues: periods.map((period) => period.calculationIssue),
    targetLabels: periods.map((period) => period.targetLabel),
    series,
    medianValues,
    leaderValues,
    leaderLabels,
    globalMax: Math.max(0, ...series.flatMap((item) => item.values)),
  };
}

export function buildFormulaInsight(model: FormulaVisualizationModel, selectedKey?: string): string {
  const selected = model.series.find((item) => item.targetKey === selectedKey) ?? model.series[0];
  if (!selected || selected.values.length === 0) return "当前筛选暂无可比较的统计结果。";

  const latest = selected.values.at(-1) ?? 0;
  const average = selected.values.reduce((sum, value) => sum + value, 0) / selected.values.length;
  const latestRank = selected.ranks.at(-1) ?? 0;
  const previousRank = selected.ranks.at(-2);
  const difference = average === 0 ? 0 : ((latest - average) / average) * 100;
  const comparison = difference === 0
    ? "与区间均值持平"
    : `${difference > 0 ? "高于" : "低于"}区间均值 ${Math.abs(roundOne(difference))}%`;
  const movement = previousRank === undefined || previousRank === latestRank
    ? "排名保持稳定"
    : previousRank > latestRank
      ? `排名较上期上升 ${previousRank - latestRank} 位`
      : `排名较上期回落 ${latestRank - previousRank} 位`;

  return `${selected.label}最新 ${latest} 次，${comparison}，当前第 ${latestRank} 位，${movement}。`;
}

export function selectRankSeries(
  model: FormulaVisualizationModel,
  selectedKey?: string,
  limit = 6,
): FormulaVisualizationSeries[] {
  const safeLimit = Math.max(1, Math.floor(limit));
  const visible = model.series.slice(0, safeLimit);
  const selected = model.series.find((item) => item.targetKey === selectedKey);
  if (!selected || visible.some((item) => item.targetKey === selected.targetKey)) return visible;
  return [...visible.slice(0, safeLimit - 1), selected];
}

export function buildFormulaParetoRows(
  contributions: FormulaSummaryContribution[],
  maxRows = 10,
): FormulaParetoRow[] {
  const rules = new Map<string, { id: string; label: string; count: number }>();
  for (const contribution of contributions) {
    const current = rules.get(contribution.ruleId);
    if (current) current.count += 1;
    else rules.set(contribution.ruleId, {
      id: contribution.ruleId,
      label: contribution.ruleName,
      count: 1,
    });
  }

  const sorted = [...rules.values()].sort((a, b) => (
    b.count - a.count || compareLabel(a.label, b.label)
  ));
  const safeMaxRows = Math.max(2, Math.floor(maxRows));
  const visible = sorted.length > safeMaxRows
    ? [
      ...sorted.slice(0, safeMaxRows - 1),
      {
        id: "__remainder__",
        label: "其他公式",
        count: sorted.slice(safeMaxRows - 1).reduce((sum, row) => sum + row.count, 0),
      },
    ]
    : sorted;
  const total = sorted.reduce((sum, row) => sum + row.count, 0);
  let cumulative = 0;

  return visible.map((row, index) => {
    cumulative += row.count;
    return {
      ...row,
      cumulativeShare: index === visible.length - 1 || total === 0
        ? 100
        : roundOne((cumulative / total) * 100),
      isRemainder: row.id === "__remainder__",
    };
  });
}
