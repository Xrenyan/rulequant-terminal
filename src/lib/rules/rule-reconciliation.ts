import { canRuleParticipateInReference, type RuleValidationSummary } from "@/lib/rules/rule-validation";
import type { RuleRecord } from "@/types/domain";

export type RuleReconciliationRow = {
  sourceFile: string;
  recognizedCount: number;
  enteredLibraryCount: number;
  failedRecognitionCount: number;
  pendingConfirmationCount: number;
  passedCount: number;
  mismatchCount: number;
  participatingCount: number;
  ruleIds: string[];
  ruleNames: string[];
  failedReason?: string;
};

type BuildRuleReconciliationInput = {
  sourceFiles: string[];
  rules: RuleRecord[];
  validationSummaries: RuleValidationSummary[];
};

export function buildRuleReconciliation(input: BuildRuleReconciliationInput): RuleReconciliationRow[] {
  const validationMap = new Map(input.validationSummaries.map((summary) => [summary.ruleId, summary]));
  const allSourceFiles = [...new Set([...input.sourceFiles, ...input.rules.map((rule) => rule.sourceFile).filter(Boolean)])];

  return allSourceFiles.map((sourceFile) => {
    const fileRules = input.rules.filter((rule) => rule.sourceFile === sourceFile);
    const summaries = fileRules.map((rule) => validationMap.get(rule.id)).filter((item): item is RuleValidationSummary => Boolean(item));
    const pendingConfirmationCount = summaries.filter((summary) => summary.status === "unchecked").length;
    const mismatchCount = summaries.filter((summary) => summary.status === "mismatch").length;
    const passedCount = summaries.filter((summary) => summary.status === "checked").length;
    const participatingCount = fileRules.filter((rule) => canRuleParticipateInReference(rule, validationMap.get(rule.id))).length;

    return {
      sourceFile,
      recognizedCount: fileRules.length,
      enteredLibraryCount: fileRules.length,
      failedRecognitionCount: fileRules.length ? 0 : 1,
      pendingConfirmationCount,
      passedCount,
      mismatchCount,
      participatingCount,
      ruleIds: fileRules.map((rule) => rule.id),
      ruleNames: fileRules.map((rule) => rule.name),
      failedReason: fileRules.length ? undefined : "该 TXT 暂未识别出可计算公式，需要人工补录或补充样例。",
    };
  });
}
