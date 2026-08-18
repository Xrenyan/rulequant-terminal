import type {
  FormulaPairDiagnostic,
  FormulaPairDiagnosticsReport,
} from "@/lib/formula-analysis/types";
import type {
  FormulaSummaryAction,
  FormulaSummaryPeriod,
  FormulaSummaryTarget,
  FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";

type BuildFormulaPairDiagnosticsInput = {
  periods: FormulaSummaryPeriod[];
  minimumCommonPeriods?: number;
  duplicateThreshold?: number;
  conflictThreshold?: number;
};

type FormulaSeries = {
  ruleId: string;
  ruleName: string;
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  periods: Map<string, Set<string>>;
};

function targetKey(target: FormulaSummaryTarget): string {
  return `${typeof target}:${String(target)}`;
}

function seriesKey(ruleId: string, action: FormulaSummaryAction, targetType: FormulaSummaryTargetType): string {
  return JSON.stringify([ruleId, action, targetType]);
}

function compareIssuesDescending(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return rightNumber - leftNumber;
  }
  return right.localeCompare(left, "zh-CN", { numeric: true });
}

export function jaccardSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function hasOverlap(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function buildSeries(periods: FormulaSummaryPeriod[]): FormulaSeries[] {
  const byKey = new Map<string, FormulaSeries>();
  for (const period of periods) {
    for (const contribution of period.contributions) {
      const key = seriesKey(contribution.ruleId, contribution.action, contribution.targetType);
      let series = byKey.get(key);
      if (!series) {
        series = {
          ruleId: contribution.ruleId,
          ruleName: contribution.ruleName,
          action: contribution.action,
          targetType: contribution.targetType,
          periods: new Map(),
        };
        byKey.set(key, series);
      }
      let targets = series.periods.get(period.calculationIssue);
      if (!targets) {
        targets = new Set();
        series.periods.set(period.calculationIssue, targets);
      }
      for (const target of contribution.targets) targets.add(targetKey(target));
    }
  }
  return [...byKey.values()].sort((left, right) => (
    left.targetType.localeCompare(right.targetType)
    || left.ruleName.localeCompare(right.ruleName, "zh-CN")
    || left.action.localeCompare(right.action)
  ));
}

function diagnosePair(
  left: FormulaSeries,
  right: FormulaSeries,
  thresholds: Required<Omit<BuildFormulaPairDiagnosticsInput, "periods">>,
): FormulaPairDiagnostic | undefined {
  if (left.targetType !== right.targetType || left.ruleId === right.ruleId) return undefined;
  const commonIssues = [...left.periods.keys()].filter((issue) => right.periods.has(issue));
  if (commonIssues.length < thresholds.minimumCommonPeriods) return undefined;

  let totalScore = 0;
  let exactMatchPeriods = 0;
  let overlapPeriods = 0;
  const overlapIssues: string[] = [];
  for (const issue of commonIssues) {
    const leftTargets = left.periods.get(issue)!;
    const rightTargets = right.periods.get(issue)!;
    totalScore += jaccardSimilarity(leftTargets, rightTargets);
    if (sameSet(leftTargets, rightTargets)) exactMatchPeriods += 1;
    if (hasOverlap(leftTargets, rightTargets)) {
      overlapPeriods += 1;
      overlapIssues.push(issue);
    }
  }

  const rawScore = totalScore / commonIssues.length;
  const score = Number(rawScore.toFixed(4));
  const kind = left.action === right.action ? "duplicate" : "conflict";
  const qualifies = kind === "duplicate"
    ? rawScore >= thresholds.duplicateThreshold || exactMatchPeriods / commonIssues.length >= 0.7
    : rawScore >= thresholds.conflictThreshold && overlapPeriods >= 3;
  if (!qualifies) return undefined;

  const [first, second] = left.ruleId.localeCompare(right.ruleId) <= 0 ? [left, right] : [right, left];
  return {
    kind,
    leftRuleId: first.ruleId,
    leftRuleName: first.ruleName,
    rightRuleId: second.ruleId,
    rightRuleName: second.ruleName,
    targetType: left.targetType,
    commonPeriods: commonIssues.length,
    score,
    exactMatchPeriods,
    overlapPeriods,
    exampleIssues: overlapIssues.sort(compareIssuesDescending).slice(0, 3),
  };
}

function sortDiagnostics(left: FormulaPairDiagnostic, right: FormulaPairDiagnostic): number {
  return right.score - left.score
    || right.commonPeriods - left.commonPeriods
    || left.leftRuleName.localeCompare(right.leftRuleName, "zh-CN")
    || left.rightRuleName.localeCompare(right.rightRuleName, "zh-CN");
}

export function buildFormulaPairDiagnostics(input: BuildFormulaPairDiagnosticsInput): FormulaPairDiagnosticsReport {
  const thresholds = {
    minimumCommonPeriods: input.minimumCommonPeriods ?? 5,
    duplicateThreshold: input.duplicateThreshold ?? 0.8,
    conflictThreshold: input.conflictThreshold ?? 0.5,
  };
  const series = buildSeries(input.periods);
  const duplicates: FormulaPairDiagnostic[] = [];
  const conflicts: FormulaPairDiagnostic[] = [];
  for (let leftIndex = 0; leftIndex < series.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < series.length; rightIndex += 1) {
      const diagnostic = diagnosePair(series[leftIndex], series[rightIndex], thresholds);
      if (!diagnostic) continue;
      if (diagnostic.kind === "duplicate") duplicates.push(diagnostic);
      else conflicts.push(diagnostic);
    }
  }
  return {
    duplicates: duplicates.sort(sortDiagnostics),
    conflicts: conflicts.sort(sortDiagnostics),
    minimumCommonPeriods: thresholds.minimumCommonPeriods,
    duplicateThreshold: thresholds.duplicateThreshold,
    conflictThreshold: thresholds.conflictThreshold,
  };
}
