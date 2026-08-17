import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import {
  buildFormulaSummaryGroups,
  buildFormulaSummaryReport,
  type FormulaSummaryPeriod,
} from "@/lib/formula-summary/formula-summary";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const draws: DrawRecord[] = [
  { issue: "101", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "102", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
  { issue: "103", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
];

function makeRule(
  id: string,
  category: RuleRecord["category"],
  formula: string,
  enabled = true,
): RuleRecord {
  return {
    id,
    name: id,
    category,
    formula,
    enabled,
    orderMode: "L",
    normalizer: "auto",
    target: "next_special",
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    tags: [],
    description: "",
    sourceFile: "unit",
    examples: [],
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("formula result statistics", () => {
  it("counts two formulas that output the same target as two equal contributions", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [
        makeRule("kill-a", "kill_zodiac", "平1"),
        makeRule("kill-b", "kill_zodiac", "平1"),
      ],
    });
    const groups = buildFormulaSummaryGroups([report.periods.at(-1)!]);
    const zodiacGroup = groups.find((group) => group.action === "exclude" && group.targetType === "zodiac");

    expect(zodiacGroup?.items[0]).toMatchObject({ count: 2 });
  });

  it("aligns calculation issues with their corresponding next issues and keeps the latest pending", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [makeRule("kill-a", "kill_zodiac", "平1")],
    });

    expect(report.periods.map((period) => [period.calculationIssue, period.targetIssue])).toEqual([
      ["101", "102"],
      ["102", "103"],
      ["103", undefined],
    ]);
    expect(report.latestPeriod).toMatchObject({
      calculationIssue: "103",
      targetLabel: "下期待开奖",
      isPending: true,
    });
  });

  it("excludes parity and size categories while retaining half-head and half-color semantics", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [
        makeRule("kill-parity", "kill_parity", "平1"),
        makeRule("include-parity", "include_parity", "平1"),
        makeRule("kill-size", "kill_size", "平1"),
        makeRule("include-size", "include_size", "平1"),
        makeRule("half-head", "kill_half_head", "平1"),
        makeRule("half-color", "kill_half_color", "平1"),
        makeRule("door", "kill_door", "平1"),
      ],
    });
    const latest = report.latestPeriod!;

    expect(report.enabledRuleCount).toBe(7);
    expect(report.formulaCount).toBe(3);
    expect(report.ignoredRuleCount).toBe(4);
    expect(latest.contributions.map((item) => [item.targetType, item.targets[0]])).toEqual([
      ["half-head", "2头单"],
      ["half-color", "蓝波单"],
      ["door", "5门"],
    ]);
    expect(latest.contributions.every((item) => (item.affectedTargets?.length ?? 0) > 0)).toBe(true);
  });

  it("keeps kill-three exclusion and nine-zodiac support in separate groups", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [makeRule("three-nine", "kill_three_as_nine", "平1")],
    });
    const latest = report.latestPeriod!;
    const groups = buildFormulaSummaryGroups([latest]);
    const excluded = groups.find((group) => group.action === "exclude" && group.targetType === "zodiac")!;
    const included = groups.find((group) => group.action === "include" && group.targetType === "zodiac")!;

    expect(excluded.items.map((item) => item.label).sort()).toEqual(["兔", "鸡", "龙"].sort());
    expect(excluded.totalCount).toBe(3);
    expect(included.items).toHaveLength(9);
    expect(included.totalCount).toBe(9);
  });

  it("deduplicates repeated targets inside one formula contribution", () => {
    const period: FormulaSummaryPeriod = {
      calculationIssue: "103",
      targetLabel: "下期待开奖",
      isPending: true,
      skippedRules: [],
      contributions: [{
        id: "103:duplicate",
        calculationIssue: "103",
        targetLabel: "下期待开奖",
        isPending: true,
        ruleId: "duplicate",
        ruleName: "重复目标",
        category: "include_zodiac",
        formula: "平1",
        expression: "平1",
        action: "include",
        targetType: "zodiac",
        targets: ["马", "马"],
        process: [],
      }],
    };

    const group = buildFormulaSummaryGroups([period])[0];
    expect(group.items).toEqual([expect.objectContaining({ label: "马", count: 1 })]);
    expect(group.totalCount).toBe(1);
  });

  it("counts each custom-set member once and ignores disabled formulas", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [
        makeRule("custom", "custom_set", "平1"),
        makeRule("disabled", "kill_zodiac", "平1", false),
      ],
    });
    const groups = buildFormulaSummaryGroups([report.latestPeriod!]);

    expect(report.enabledRuleCount).toBe(1);
    expect(report.formulaCount).toBe(1);
    expect(groups).toEqual([
      expect.objectContaining({
        action: "include",
        targetType: "number",
        items: [expect.objectContaining({ target: 15, count: 1 })],
      }),
    ]);
  });

  it("records calculation failures without blocking the remaining formulas", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      rules: [
        makeRule("good", "kill_tail", "平1"),
        makeRule("broken", "kill_tail", "不存在变量"),
      ],
    });

    expect(report.latestPeriod?.contributions).toHaveLength(1);
    expect(report.latestPeriod?.skippedRules).toEqual([
      expect.objectContaining({ ruleId: "broken", calculationIssue: "103" }),
    ]);
    expect(report.skippedCount).toBe(3);
  });

  it("limits aggregation to the requested number of most recent calculation periods", () => {
    const report = buildFormulaSummaryReport({
      draws,
      config: defaultConfig,
      maxPeriods: 2,
      rules: [makeRule("kill-a", "kill_zodiac", "平1")],
    });

    expect(report.periods.map((period) => period.calculationIssue)).toEqual(["102", "103"]);
  });
});
