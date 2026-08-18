import { validateRuleQuantConfig } from "@/lib/config/validate-config";
import type {
  DataFreshness,
  DataHealthFormulaError,
  DataHealthInvalidDraw,
  DataHealthReport,
  DataHealthStatus,
} from "@/lib/formula-analysis/types";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

type DataHealthSource = {
  label: string;
  updatedAt?: string;
  offline?: boolean;
  partial?: boolean;
};

type BuildDataHealthReportInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  source: DataHealthSource;
  formulaErrors?: DataHealthFormulaError[];
  authoritativeIssueSequence?: string[];
  now?: string;
};

const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function balls(draw: DrawRecord): number[] {
  return [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
}

function drawSignature(draw: DrawRecord): string {
  return balls(draw).join(",");
}

function compareIssues(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right, "zh-CN", { numeric: true });
}

function validateDraw(draw: DrawRecord): DataHealthInvalidDraw | undefined {
  const values = balls(draw);
  const errors: string[] = [];
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 49)) {
    errors.push("号码必须是 1-49 的整数");
  }
  if (new Set(values).size !== values.length) errors.push("同一期的 7 个号码不能重复");
  return errors.length ? { issue: draw.issue, errors } : undefined;
}

function freshness(updatedAt: string | undefined, now: string | undefined): DataFreshness {
  if (!updatedAt) return "unknown";
  const updatedTime = Date.parse(updatedAt);
  const nowTime = Date.parse(now ?? new Date().toISOString());
  if (!Number.isFinite(updatedTime) || !Number.isFinite(nowTime)) return "unknown";
  return nowTime - updatedTime > STALE_AFTER_MS ? "stale" : "fresh";
}

function deriveStatus(input: {
  source: DataHealthSource;
  freshness: DataFreshness;
  conflictingIssues: string[];
  invalidDraws: DataHealthInvalidDraw[];
  configErrors: string[];
  formulaErrors: DataHealthFormulaError[];
}): DataHealthStatus {
  if (input.source.offline) return "offline";
  if (input.source.partial) return "partial";
  if (
    input.freshness === "stale"
    || input.conflictingIssues.length
    || input.invalidDraws.length
    || input.configErrors.length
    || input.formulaErrors.length
  ) return "attention";
  return "healthy";
}

export function buildDataHealthReport(input: BuildDataHealthReportInput): DataHealthReport {
  const byIssue = new Map<string, DrawRecord[]>();
  for (const draw of input.draws) {
    const records = byIssue.get(draw.issue) ?? [];
    records.push(draw);
    byIssue.set(draw.issue, records);
  }

  let identicalDuplicateCount = 0;
  const conflictingIssues: string[] = [];
  for (const [issue, records] of byIssue) {
    const signatures = new Set(records.map(drawSignature));
    identicalDuplicateCount += records.length - signatures.size;
    if (signatures.size > 1) conflictingIssues.push(issue);
  }
  conflictingIssues.sort(compareIssues);

  const invalidDraws = input.draws
    .map(validateDraw)
    .filter((item): item is DataHealthInvalidDraw => Boolean(item));
  const configErrors: string[] = [];
  try {
    validateRuleQuantConfig(input.config);
  } catch (error) {
    configErrors.push(error instanceof Error ? error.message : String(error));
  }

  const issues = [...byIssue.keys()].sort(compareIssues);
  const expected = input.authoritativeIssueSequence;
  const missingIssues = expected
    ? expected.filter((issue) => !byIssue.has(issue))
    : [];
  const dataFreshness = freshness(input.source.updatedAt, input.now);
  const formulaErrors = input.formulaErrors ?? [];
  const status = deriveStatus({
    source: input.source,
    freshness: dataFreshness,
    conflictingIssues,
    invalidDraws,
    configErrors,
    formulaErrors,
  });

  return {
    status,
    freshness: dataFreshness,
    sourceLabel: input.source.label,
    updatedAt: input.source.updatedAt,
    latestIssue: issues.at(-1),
    recordCount: issues.length,
    enabledRuleCount: input.rules.filter((rule) => rule.enabled).length,
    identicalDuplicateCount,
    conflictingIssues,
    invalidDraws,
    configErrors,
    formulaErrors,
    missingIssueStatus: expected ? "known" : "unknown",
    missingIssues,
  };
}
