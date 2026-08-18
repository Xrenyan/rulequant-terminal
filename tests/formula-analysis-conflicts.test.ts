import { describe, expect, it } from "vitest";
import { buildFormulaPairDiagnostics, jaccardSimilarity } from "@/lib/formula-analysis/formula-conflicts";
import type {
  FormulaSummaryAction,
  FormulaSummaryContribution,
  FormulaSummaryPeriod,
  FormulaSummaryTarget,
  FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";

function contribution(input: {
  issue: string;
  ruleId: string;
  ruleName?: string;
  action?: FormulaSummaryAction;
  targetType?: FormulaSummaryTargetType;
  targets: FormulaSummaryTarget[];
}): FormulaSummaryContribution {
  return {
    id: `${input.issue}:${input.ruleId}:${input.action ?? "exclude"}`,
    calculationIssue: input.issue,
    targetIssue: String(Number(input.issue) + 1),
    targetLabel: String(Number(input.issue) + 1),
    isPending: false,
    ruleId: input.ruleId,
    ruleName: input.ruleName ?? input.ruleId,
    category: input.targetType === "tail" ? "kill_tail" : "kill_zodiac",
    formula: "平1",
    expression: "平1",
    action: input.action ?? "exclude",
    targetType: input.targetType ?? "zodiac",
    targets: input.targets,
    process: [],
  };
}

function period(issue: string, contributions: FormulaSummaryContribution[]): FormulaSummaryPeriod {
  return {
    calculationIssue: issue,
    targetIssue: String(Number(issue) + 1),
    targetLabel: String(Number(issue) + 1),
    isPending: false,
    contributions,
    skippedRules: [],
  };
}

describe("formula pair diagnostics", () => {
  it("calculates Jaccard similarity from unique target keys", () => {
    expect(jaccardSimilarity(new Set(["龙", "兔"]), new Set(["兔", "虎"]))).toBe(1 / 3);
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("finds highly duplicated formulas only within the same action and target type", () => {
    const targetSets = [
      ["龙", "兔"],
      ["龙"],
      ["龙", "虎"],
      ["兔"],
      ["龙", "兔"],
      ["龙"],
    ];
    const periods = targetSets.map((targets, index) => {
      const issue = String(101 + index);
      return period(issue, [
        contribution({ issue, ruleId: "a", ruleName: "杀肖甲", targets }),
        contribution({ issue, ruleId: "b", ruleName: "杀肖乙", targets: [...targets].reverse() }),
        contribution({ issue, ruleId: "tail", targetType: "tail", targets: [index % 10] }),
      ]);
    });

    const report = buildFormulaPairDiagnostics({ periods });

    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]).toMatchObject({
      kind: "duplicate",
      leftRuleId: "a",
      rightRuleId: "b",
      targetType: "zodiac",
      commonPeriods: 6,
      score: 1,
      exactMatchPeriods: 6,
      overlapPeriods: 6,
    });
    expect(report.duplicates[0].exampleIssues).toEqual(["106", "105", "104"]);
    expect(report.conflicts).toHaveLength(0);
  });

  it("finds repeated overlap between opposite directions and keeps evidence", () => {
    const periods = Array.from({ length: 6 }, (_, index) => {
      const issue = String(201 + index);
      const targets = index % 2 === 0 ? ["龙", "兔"] : ["龙"];
      return period(issue, [
        contribution({ issue, ruleId: "exclude", ruleName: "排除龙兔", targets }),
        contribution({ issue, ruleId: "include", ruleName: "支持龙兔", action: "include", targets }),
      ]);
    });

    const report = buildFormulaPairDiagnostics({ periods });

    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({
      kind: "conflict",
      leftRuleId: "exclude",
      rightRuleId: "include",
      targetType: "zodiac",
      commonPeriods: 6,
      score: 1,
      exactMatchPeriods: 6,
      overlapPeriods: 6,
    });
    expect(report.conflicts[0].exampleIssues).toEqual(["206", "205", "204"]);
  });

  it("does not promote pairs with insufficient common periods or weak overlap", () => {
    const periods = Array.from({ length: 6 }, (_, index) => {
      const issue = String(301 + index);
      const sparse = index < 4
        ? [contribution({ issue, ruleId: "sparse", targets: ["龙"] })]
        : [];
      return period(issue, [
        contribution({ issue, ruleId: "base", targets: ["龙", "兔"] }),
        contribution({ issue, ruleId: "weak", targets: index === 0 ? ["龙"] : ["羊"] }),
        ...sparse,
      ]);
    });

    const report = buildFormulaPairDiagnostics({ periods });

    expect(report.duplicates).toEqual([]);
    expect(report.conflicts).toEqual([]);
  });
});
