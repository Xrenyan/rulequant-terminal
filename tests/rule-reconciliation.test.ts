import { describe, expect, test } from "vitest";
import { buildRuleReconciliation } from "@/lib/rules/rule-reconciliation";
import type { RuleRecord } from "@/types/domain";
import type { RuleValidationSummary } from "@/lib/rules/rule-validation";

const baseRule: Omit<RuleRecord, "id" | "name" | "sourceFile"> = {
  category: "kill_zodiac",
  orderMode: "L",
  formula: "平1",
  normalizer: "subtract_48_to_1_49",
  target: "special_zodiac",
  verifyMode: "next_special",
  positionPattern: [],
  periodSpan: 1,
  enabled: true,
  tags: [],
  description: "",
  examples: [],
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
};

function rule(id: string, sourceFile: string): RuleRecord {
  return { ...baseRule, id, name: id, sourceFile };
}

function summary(ruleId: string, status: RuleValidationSummary["status"], canJoinReference: boolean): RuleValidationSummary {
  return {
    ruleId,
    status,
    label: status,
    tone: status === "checked" ? "green" : status === "mismatch" ? "rose" : "yellow",
    canJoinReference,
    reason: "",
    sampleCount: status === "unchecked" ? 0 : 1,
    passedSampleCount: status === "checked" ? 1 : 0,
    mismatchCount: status === "mismatch" ? 1 : 0,
  };
}

describe("rule reconciliation", () => {
  test("counts recognized, failed, pending, mismatched, and participating rules per source file", () => {
    const rows = buildRuleReconciliation({
      sourceFiles: ["A.txt", "B.txt", "C.txt"],
      rules: [rule("r1", "A.txt"), rule("r2", "A.txt"), rule("r3", "B.txt")],
      validationSummaries: [
        summary("r1", "checked", true),
        summary("r2", "unchecked", false),
        summary("r3", "mismatch", false),
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        sourceFile: "A.txt",
        recognizedCount: 2,
        enteredLibraryCount: 2,
        failedRecognitionCount: 0,
        pendingConfirmationCount: 1,
        mismatchCount: 0,
        participatingCount: 1,
      }),
      expect.objectContaining({
        sourceFile: "B.txt",
        recognizedCount: 1,
        enteredLibraryCount: 1,
        failedRecognitionCount: 0,
        pendingConfirmationCount: 0,
        mismatchCount: 1,
        participatingCount: 0,
      }),
      expect.objectContaining({
        sourceFile: "C.txt",
        recognizedCount: 0,
        enteredLibraryCount: 0,
        failedRecognitionCount: 1,
        pendingConfirmationCount: 0,
        mismatchCount: 0,
        participatingCount: 0,
      }),
    ]);
  });
});
