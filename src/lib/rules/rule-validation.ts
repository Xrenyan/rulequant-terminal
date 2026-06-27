import type { BacktestResult, RuleBacktestResult, RuleRecord, SampleCheckResult } from "@/types/domain";

export type RuleValidationStatus =
  | "checked"
  | "unchecked"
  | "mismatch"
  | "failed"
  | "disabled";

export type RuleValidationSummary = {
  ruleId: string;
  status: RuleValidationStatus;
  label: string;
  tone: "green" | "yellow" | "rose" | "slate";
  canJoinReference: boolean;
  reason: string;
  sampleCount: number;
  passedSampleCount: number;
  mismatchCount: number;
  backtest?: RuleBacktestResult;
};

export function hasAmbiguousPositionVariable(rule: Pick<RuleRecord, "formula">): boolean {
  return /(?:^|[+\-*/，,\s])(?:位|平位|落位|定位|次杀位)(?:$|[+\-*/，,\s])/.test(rule.formula);
}

const STATUS_META: Record<RuleValidationStatus, Pick<RuleValidationSummary, "label" | "tone">> = {
  checked: { label: "已核对", tone: "green" },
  unchecked: { label: "未核对", tone: "yellow" },
  mismatch: { label: "核对不一致", tone: "rose" },
  failed: { label: "计算异常", tone: "rose" },
  disabled: { label: "已停用", tone: "slate" },
};

type BuildRuleValidationSummariesInput = {
  rules: RuleRecord[];
  backtest: BacktestResult;
  sampleResults: SampleCheckResult[];
};

export function requiresManualConfirmation(rule: Pick<RuleRecord, "formula" | "positionPattern">): boolean {
  return rule.positionPattern.length > 0 || /(取位|平位|位置|未确认)/.test(rule.formula);
}

export function canRuleParticipateInReference(rule: RuleRecord, summary?: Pick<RuleValidationSummary, "canJoinReference">): boolean {
  if (!rule.enabled) return false;
  if (rule.participatesInReference === false) return false;
  if (rule.sourceType === "example") return false;
  if (hasAmbiguousPositionVariable(rule)) return false;
  if (summary) return summary.canJoinReference;
  return true;
}

export function buildRuleValidationSummaries(input: BuildRuleValidationSummariesInput): RuleValidationSummary[] {
  return input.rules.map((rule) => {
    const sampleResults = input.sampleResults.filter((item) => item.ruleId === rule.id);
    const backtest = input.backtest.ruleResults.find((item) => item.rule.id === rule.id);
    const passedSampleCount = sampleResults.filter((item) => item.passed).length;
    const mismatchCount = sampleResults.length - passedSampleCount;

    let status: RuleValidationStatus = "unchecked";
    let reason = "用户提供公式，尚未做手算样例核对；只要公式可计算，仍可参与综合参考。";

    if (!rule.enabled) {
      status = "disabled";
      reason = "公式已停用，不参与一键计算和综合参考。";
    } else if (rule.sourceType === "example") {
      status = "unchecked";
      reason = "示例公式仅用于演示流程，不能混入正式综合参考结果。";
    } else if (hasAmbiguousPositionVariable(rule)) {
      status = "unchecked";
      reason = "公式含未锁定的“位”变量，需要先人工确认具体取值口径，暂不参与综合参考，避免乱算。";
    } else if (!backtest || backtest.total === 0) {
      status = "failed";
      reason = backtest?.error || "公式无法完成回测，请检查变量、公式类型或结果处理方式。";
    } else if (mismatchCount > 0) {
      status = "mismatch";
      reason = "系统计算和手算样例不一致，请重点核对；公式本身仍按用户提供公式参与综合参考。";
    } else if (sampleResults.length > 0 && mismatchCount === 0) {
      status = "checked";
      reason = "已有手算样例核对通过，公式可参与综合参考。";
    } else if (rule.manuallyConfirmed) {
      status = "unchecked";
      reason = "用户已人工确认使用；样例核对仍只是检查程序是否算错，不作为参与门槛。";
    } else if (requiresManualConfirmation(rule)) {
      status = "unchecked";
      reason = "该公式含取位序列或需继续核对，但只要计算正常，仍可参与综合参考。";
    }

    const meta = STATUS_META[status];
    const canJoinReference =
      rule.enabled &&
      rule.participatesInReference !== false &&
      rule.sourceType !== "example" &&
      !hasAmbiguousPositionVariable(rule) &&
      status !== "failed" &&
      status !== "disabled";

    return {
      ruleId: rule.id,
      status,
      label: meta.label,
      tone: meta.tone,
      canJoinReference,
      reason,
      sampleCount: sampleResults.length,
      passedSampleCount,
      mismatchCount,
      backtest,
    };
  });
}
