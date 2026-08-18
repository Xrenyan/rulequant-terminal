import type { RuleRecord } from "@/types/domain";
import type { FormulaSummaryTargetType } from "@/lib/formula-summary/formula-summary";

export type FormulaAnalysisWindow = 10 | 30 | 50;

export type FormulaHealthStatus =
  | "normal"
  | "sample-low"
  | "consecutive-failure"
  | "volatile"
  | "calculation-error";

export type FormulaHealthMetric = {
  window: FormulaAnalysisWindow;
  sampleSize: number;
  successes: number;
  failures: number;
  successRate: number;
};

export type FormulaHealthRow = {
  ruleId: string;
  ruleName: string;
  category: RuleRecord["category"];
  windows: Record<FormulaAnalysisWindow, FormulaHealthMetric>;
  currentSuccessStreak: number;
  currentFailureStreak: number;
  longestFailureStreak: number;
  skippedCount: number;
  error?: string;
  status: FormulaHealthStatus;
  latestFailureIssues: string[];
};

export type FormulaHealthReport = {
  generatedAt: string;
  rows: FormulaHealthRow[];
  counts: Record<FormulaHealthStatus, number>;
};

export type FormulaPairDiagnosticKind = "duplicate" | "conflict";

export type FormulaPairDiagnostic = {
  kind: FormulaPairDiagnosticKind;
  leftRuleId: string;
  leftRuleName: string;
  rightRuleId: string;
  rightRuleName: string;
  targetType: FormulaSummaryTargetType;
  commonPeriods: number;
  score: number;
  exactMatchPeriods: number;
  overlapPeriods: number;
  exampleIssues: string[];
};

export type FormulaPairDiagnosticsReport = {
  duplicates: FormulaPairDiagnostic[];
  conflicts: FormulaPairDiagnostic[];
  minimumCommonPeriods: number;
  duplicateThreshold: number;
  conflictThreshold: number;
};

export type DataHealthStatus = "healthy" | "attention" | "partial" | "offline";
export type DataFreshness = "fresh" | "stale" | "unknown";

export type DataHealthFormulaError = {
  ruleId: string;
  ruleName: string;
  message: string;
};

export type DataHealthInvalidDraw = {
  issue: string;
  errors: string[];
};

export type DataHealthReport = {
  status: DataHealthStatus;
  freshness: DataFreshness;
  sourceLabel: string;
  updatedAt?: string;
  latestIssue?: string;
  recordCount: number;
  enabledRuleCount: number;
  identicalDuplicateCount: number;
  conflictingIssues: string[];
  invalidDraws: DataHealthInvalidDraw[];
  configErrors: string[];
  formulaErrors: DataHealthFormulaError[];
  missingIssueStatus: "known" | "unknown";
  missingIssues: string[];
};
