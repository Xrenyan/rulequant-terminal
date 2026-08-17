import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule, type FormulaEngineCalculation } from "@/lib/formula-engine/formula-engine";
import type { DrawRecord, RuleCategory, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type FormulaSummaryAction = "exclude" | "include";

export type FormulaSummaryTargetType =
  | "zodiac"
  | "color"
  | "sum"
  | "tail"
  | "head"
  | "half-head"
  | "half-color"
  | "door"
  | "element"
  | "segment"
  | "number";

export type FormulaSummaryTarget = number | string;

export type FormulaSummaryContribution = {
  id: string;
  calculationIssue: string;
  targetIssue?: string;
  targetLabel: string;
  isPending: boolean;
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  formula: string;
  expression: string;
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  targets: FormulaSummaryTarget[];
  affectedTargets?: FormulaSummaryTarget[];
  process: string[];
};

export type FormulaSummarySkippedRule = {
  calculationIssue: string;
  ruleId: string;
  ruleName: string;
  error: string;
};

export type FormulaSummaryPeriod = {
  calculationIssue: string;
  calculationDate?: string;
  targetIssue?: string;
  targetLabel: string;
  isPending: boolean;
  contributions: FormulaSummaryContribution[];
  skippedRules: FormulaSummarySkippedRule[];
};

export type FormulaSummaryRankItem = {
  target: FormulaSummaryTarget;
  targetKey: string;
  label: string;
  count: number;
  contributions: FormulaSummaryContribution[];
};

export type FormulaSummaryGroup = {
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  label: string;
  totalCount: number;
  items: FormulaSummaryRankItem[];
};

export type FormulaSummaryReport = {
  periods: FormulaSummaryPeriod[];
  latestPeriod?: FormulaSummaryPeriod;
  enabledRuleCount: number;
  formulaCount: number;
  ignoredRuleCount: number;
  contributionCount: number;
  skippedCount: number;
};

type PeriodIdentity = {
  calculationIssue: string;
  targetIssue?: string;
  targetLabel: string;
  isPending: boolean;
};

type CategoryTarget = {
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
};

const DEFAULT_MAX_PERIODS = 10;

const IGNORED_CATEGORIES = new Set<RuleCategory>([
  "kill_parity",
  "include_parity",
  "kill_size",
  "include_size",
]);

const TARGET_TYPE_LABELS: Record<FormulaSummaryTargetType, string> = {
  zodiac: "生肖",
  color: "波色",
  sum: "合数",
  tail: "尾数",
  head: "头数",
  "half-head": "半头",
  "half-color": "半波",
  door: "门数",
  element: "五行",
  segment: "段位",
  number: "号码",
};

const TARGET_TYPE_ORDER: FormulaSummaryTargetType[] = [
  "zodiac",
  "tail",
  "head",
  "sum",
  "segment",
  "element",
  "color",
  "half-head",
  "half-color",
  "door",
  "number",
];

function sortDraws(draws: DrawRecord[]): DrawRecord[] {
  return [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}

function targetKey(target: FormulaSummaryTarget): string {
  return `${typeof target}:${String(target)}`;
}

function uniqueTargets(targets: FormulaSummaryTarget[]): FormulaSummaryTarget[] {
  const seen = new Set<string>();
  const unique: FormulaSummaryTarget[] = [];
  for (const target of targets) {
    const key = targetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(target);
  }
  return unique;
}

function categoryTarget(category: RuleCategory): CategoryTarget | undefined {
  switch (category) {
    case "kill_zodiac":
      return { action: "exclude", targetType: "zodiac" };
    case "include_zodiac":
      return { action: "include", targetType: "zodiac" };
    case "kill_color":
      return { action: "exclude", targetType: "color" };
    case "include_color":
      return { action: "include", targetType: "color" };
    case "kill_sum":
      return { action: "exclude", targetType: "sum" };
    case "kill_tail":
      return { action: "exclude", targetType: "tail" };
    case "kill_head":
      return { action: "exclude", targetType: "head" };
    case "kill_element":
      return { action: "exclude", targetType: "element" };
    case "kill_segment":
      return { action: "exclude", targetType: "segment" };
    case "seven_tail":
      return { action: "include", targetType: "tail" };
    case "six_zodiac":
    case "eight_zodiac":
    case "eight_zodiac_two_period":
    case "nine_zodiac":
      return { action: "include", targetType: "zodiac" };
    case "custom_set":
      return { action: "include", targetType: "number" };
    case "kill_parity":
    case "include_parity":
    case "kill_size":
    case "include_size":
    case "kill_half_head":
    case "kill_half_color":
    case "kill_door":
    case "kill_three_as_nine":
      return undefined;
  }
}

function makeContribution(
  rule: RuleRecord,
  calculation: FormulaEngineCalculation,
  period: PeriodIdentity,
  action: FormulaSummaryAction,
  summaryTargetType: FormulaSummaryTargetType,
  targets: FormulaSummaryTarget[],
  affectedTargets?: FormulaSummaryTarget[],
  discriminator = "primary",
): FormulaSummaryContribution {
  return {
    id: `${period.calculationIssue}:${rule.id}:${action}:${summaryTargetType}:${discriminator}`,
    ...period,
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category,
    formula: rule.formula,
    expression: calculation.expression,
    action,
    targetType: summaryTargetType,
    targets: uniqueTargets(targets),
    affectedTargets: affectedTargets?.length ? uniqueTargets(affectedTargets) : undefined,
    process: [...calculation.process],
  };
}

function contributionsForRule(
  rule: RuleRecord,
  calculation: FormulaEngineCalculation,
  period: PeriodIdentity,
): FormulaSummaryContribution[] {
  if (rule.category === "kill_three_as_nine") {
    return [
      makeContribution(
        rule,
        calculation,
        period,
        "exclude",
        "zodiac",
        calculation.secondaryMappedResult ?? [],
        undefined,
        "excluded-three",
      ),
      makeContribution(
        rule,
        calculation,
        period,
        "include",
        "zodiac",
        calculation.mappedResult,
        undefined,
        "included-nine",
      ),
    ];
  }

  if (rule.category === "kill_half_head") {
    return [makeContribution(
      rule,
      calculation,
      period,
      "exclude",
      "half-head",
      calculation.secondaryMappedResult ?? calculation.mappedResult,
      calculation.mappedResult,
    )];
  }

  if (rule.category === "kill_half_color") {
    return [makeContribution(
      rule,
      calculation,
      period,
      "exclude",
      "half-color",
      calculation.secondaryMappedResult ?? calculation.mappedResult,
      calculation.mappedResult,
    )];
  }

  if (rule.category === "kill_door") {
    return [makeContribution(
      rule,
      calculation,
      period,
      "exclude",
      "door",
      calculation.secondaryMappedResult ?? calculation.mappedResult,
      calculation.mappedResult,
    )];
  }

  const mapping = categoryTarget(rule.category);
  if (!mapping) return [];
  return [makeContribution(rule, calculation, period, mapping.action, mapping.targetType, calculation.mappedResult)];
}

export function formulaSummaryTargetLabel(summaryTargetType: FormulaSummaryTargetType): string {
  return TARGET_TYPE_LABELS[summaryTargetType];
}

export function buildFormulaSummaryReport(input: {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  maxPeriods?: number;
}): FormulaSummaryReport {
  const sortedDraws = sortDraws(input.draws);
  const enabledRules = input.rules.filter((rule) => rule.enabled);
  const eligibleRules = enabledRules.filter((rule) => !IGNORED_CATEGORIES.has(rule.category));
  const requestedPeriods = Number.isFinite(input.maxPeriods)
    ? Math.max(0, Math.floor(input.maxPeriods ?? DEFAULT_MAX_PERIODS))
    : DEFAULT_MAX_PERIODS;
  const startIndex = Math.max(0, sortedDraws.length - requestedPeriods);
  const periods: FormulaSummaryPeriod[] = [];
  let contributionCount = 0;
  let skippedCount = 0;

  for (let index = startIndex; index < sortedDraws.length; index += 1) {
    const sourceDraw = sortedDraws[index];
    const targetIssue = sortedDraws[index + 1]?.issue;
    const periodIdentity: PeriodIdentity = {
      calculationIssue: sourceDraw.issue,
      targetIssue,
      targetLabel: targetIssue ?? "下期待开奖",
      isPending: targetIssue === undefined,
    };
    const contributions: FormulaSummaryContribution[] = [];
    const skippedRules: FormulaSummarySkippedRule[] = [];

    let normalized: ReturnType<typeof normalizeDraw>;
    try {
      normalized = normalizeDraw(sourceDraw, input.config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const rule of eligibleRules) {
        skippedRules.push({
          calculationIssue: sourceDraw.issue,
          ruleId: rule.id,
          ruleName: rule.name,
          error: message,
        });
      }
      skippedCount += skippedRules.length;
      periods.push({
        ...periodIdentity,
        calculationDate: sourceDraw.date,
        contributions,
        skippedRules,
      });
      continue;
    }

    for (const rule of eligibleRules) {
      try {
        const calculation = calculateRule(rule, normalized, input.config, { periodIndex: index });
        const ruleContributions = contributionsForRule(rule, calculation, periodIdentity)
          .filter((contribution) => contribution.targets.length > 0);
        contributions.push(...ruleContributions);
        contributionCount += ruleContributions.length;
      } catch (error) {
        skippedRules.push({
          calculationIssue: sourceDraw.issue,
          ruleId: rule.id,
          ruleName: rule.name,
          error: error instanceof Error ? error.message : String(error),
        });
        skippedCount += 1;
      }
    }

    periods.push({
      ...periodIdentity,
      calculationDate: sourceDraw.date,
      contributions,
      skippedRules,
    });
  }

  return {
    periods,
    latestPeriod: periods.at(-1),
    enabledRuleCount: enabledRules.length,
    formulaCount: eligibleRules.length,
    ignoredRuleCount: enabledRules.length - eligibleRules.length,
    contributionCount,
    skippedCount,
  };
}

export function buildFormulaSummaryGroups(periods: FormulaSummaryPeriod[]): FormulaSummaryGroup[] {
  const groups = new Map<string, {
    action: FormulaSummaryAction;
    targetType: FormulaSummaryTargetType;
    items: Map<string, FormulaSummaryRankItem>;
  }>();

  for (const period of periods) {
    for (const contribution of period.contributions) {
      const groupKey = `${contribution.action}:${contribution.targetType}`;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          action: contribution.action,
          targetType: contribution.targetType,
          items: new Map<string, FormulaSummaryRankItem>(),
        };
        groups.set(groupKey, group);
      }

      for (const target of uniqueTargets(contribution.targets)) {
        const key = targetKey(target);
        const current = group.items.get(key);
        if (current) {
          current.count += 1;
          current.contributions.push(contribution);
        } else {
          group.items.set(key, {
            target,
            targetKey: key,
            label: String(target),
            count: 1,
            contributions: [contribution],
          });
        }
      }
    }
  }

  const targetOrder = new Map(TARGET_TYPE_ORDER.map((type, index) => [type, index]));
  return [...groups.values()]
    .map((group) => {
      const items = [...group.items.values()].sort((a, b) => (
        b.count - a.count
        || a.label.localeCompare(b.label, "zh-CN", { numeric: true })
      ));
      return {
        action: group.action,
        targetType: group.targetType,
        label: formulaSummaryTargetLabel(group.targetType),
        totalCount: items.reduce((total, item) => total + item.count, 0),
        items,
      };
    })
    .sort((a, b) => (
      (a.action === b.action ? 0 : a.action === "exclude" ? -1 : 1)
      || (targetOrder.get(a.targetType) ?? 99) - (targetOrder.get(b.targetType) ?? 99)
    ));
}
