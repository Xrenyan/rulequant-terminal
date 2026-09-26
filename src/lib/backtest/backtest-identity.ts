import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

/** Only fields that can alter arithmetic or verification belong in this identity. */
export function ruleMathIdentity(rule: RuleRecord): unknown {
  return [rule.id, rule.category, rule.orderMode, rule.formula, rule.normalizer, rule.target,
    rule.verifyMode, rule.positionPattern, rule.anchorIssue ?? null, rule.anchorPatternIndex ?? null,
    rule.periodSpan, rule.verifyOffset ?? 1];
}

export function backtestDatasetKey(input: { draws: DrawRecord[]; config: RuleQuantConfig; fromIssue?: string; toIssue?: string }): string {
  // rawAttributes contain historical zodiac/element overrides and must invalidate math.
  return JSON.stringify([input.fromIssue ?? "", input.toIssue ?? "", input.draws, input.config]);
}

export function backtestMathKey(input: { draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; fromIssue?: string; toIssue?: string }): string {
  return `${backtestDatasetKey(input)}\u001f${JSON.stringify(input.rules.filter((rule) => rule.enabled).map(ruleMathIdentity))}`;
}
