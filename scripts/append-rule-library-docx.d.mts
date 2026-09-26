import type { RuleRecord } from "../src/types/domain";
export function importRuleSignature(rule: RuleRecord, signatureFor: (rule: RuleRecord) => string): string;
export function appendMissingRules(
  existing: RuleRecord[], candidates: RuleRecord[], signatureFor: (rule: RuleRecord) => string,
): {
  rules: RuleRecord[]; added: RuleRecord[];
  entries: { index: number; sourceName: string; ruleId: string; signature: string; status: string }[];
};
