import { runBacktest } from "@/lib/backtest/run-backtest";
import type {
  FormulaAnalysisWindow,
  FormulaHealthMetric,
  FormulaHealthReport,
  FormulaHealthRow,
  FormulaHealthStatus,
} from "@/lib/formula-analysis/types";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

const HEALTH_WINDOWS: FormulaAnalysisWindow[] = [10, 30, 50];

type BuildFormulaHealthReportInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
};

function compareIssues(left: DrawRecord, right: DrawRecord): number {
  const leftNumber = Number(left.issue);
  const rightNumber = Number(right.issue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.issue.localeCompare(right.issue, "zh-CN", { numeric: true });
}

function rate(successes: number, sampleSize: number): number {
  return sampleSize ? Number(((successes / sampleSize) * 100).toFixed(2)) : 0;
}

function metric(values: boolean[], window: FormulaAnalysisWindow): FormulaHealthMetric {
  const visible = values.slice(-window);
  const successes = visible.reduce((total, value) => total + (value ? 1 : 0), 0);
  return {
    window,
    sampleSize: visible.length,
    successes,
    failures: visible.length - successes,
    successRate: rate(successes, visible.length),
  };
}

function endingStreak(values: boolean[], expected: boolean): number {
  let count = 0;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== expected) break;
    count += 1;
  }
  return count;
}

function longestFailureStreak(values: boolean[]): number {
  let longest = 0;
  let current = 0;
  for (const success of values) {
    if (success) {
      current = 0;
      continue;
    }
    current += 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function healthStatus(row: Omit<FormulaHealthRow, "status">): FormulaHealthStatus {
  if (row.error) return "calculation-error";
  if (row.windows[10].sampleSize < 10) return "sample-low";
  if (row.currentFailureStreak >= 3) return "consecutive-failure";
  if (
    row.windows[30].sampleSize >= 10
    && Math.abs(row.windows[10].successRate - row.windows[30].successRate) >= 15
  ) return "volatile";
  return "normal";
}

function emptyCounts(): Record<FormulaHealthStatus, number> {
  return {
    normal: 0,
    "sample-low": 0,
    "consecutive-failure": 0,
    volatile: 0,
    "calculation-error": 0,
  };
}

export function buildFormulaHealthReport(input: BuildFormulaHealthReportInput): FormulaHealthReport {
  const draws = [...input.draws].sort(compareIssues);
  const backtest = runBacktest({ ...input, draws });
  const rows = backtest.ruleResults.map((result): FormulaHealthRow => {
    const values = result.details.map((detail) => detail.success);
    const windows = Object.fromEntries(
      HEALTH_WINDOWS.map((window) => [window, metric(values, window)]),
    ) as Record<FormulaAnalysisWindow, FormulaHealthMetric>;
    const base: Omit<FormulaHealthRow, "status"> = {
      ruleId: result.rule.id,
      ruleName: result.rule.name,
      category: result.rule.category,
      windows,
      currentSuccessStreak: endingStreak(values, true),
      currentFailureStreak: endingStreak(values, false),
      longestFailureStreak: longestFailureStreak(values),
      skippedCount: 0,
      error: result.error,
      latestFailureIssues: result.details
        .filter((detail) => !detail.success)
        .map((detail) => detail.currentIssue)
        .reverse()
        .slice(0, 10),
    };
    return { ...base, status: healthStatus(base) };
  });
  const counts = emptyCounts();
  for (const row of rows) counts[row.status] += 1;
  return { generatedAt: backtest.generatedAt, rows, counts };
}
