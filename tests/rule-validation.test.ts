import { describe, expect, test } from "vitest";
import { buildRuleValidationSummaries, canRuleParticipateInReference } from "@/lib/rules/rule-validation";
import { defaultConfig } from "@/lib/config/default-config";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { runSampleChecks } from "@/lib/sample-check/run-sample-checks";
import type { DrawRecord, RuleRecord, SampleCase } from "@/types/domain";

const draws: DrawRecord[] = [
  { issue: "001", n1: 13, n2: 28, n3: 7, n4: 41, n5: 2, n6: 36, special: 19 },
  { issue: "002", n1: 1, n2: 14, n3: 22, n4: 35, n5: 40, n6: 45, special: 8 },
];

const baseRule: RuleRecord = {
  id: "rule-pass",
  name: "公式校验样例",
  category: "kill_zodiac",
  orderMode: "L",
  formula: "平1 + 平2 + 特码尾 + 总数尾 + 59",
  normalizer: "subtract_48_to_1_49",
  target: "special_zodiac",
  verifyMode: "next_special",
  positionPattern: [],
  periodSpan: 1,
  enabled: true,
  tags: [],
  description: "",
  sourceFile: "unit",
  examples: [],
  createdAt: "2026-06-25T00:00:00.000Z",
  updatedAt: "2026-06-25T00:00:00.000Z",
};

describe("rule validation summaries", () => {
  test("labels checked, unchecked, mismatched, and disabled rules", () => {
    const rules: RuleRecord[] = [
      baseRule,
      { ...baseRule, id: "rule-pending", name: "待确认公式" },
      { ...baseRule, id: "rule-mismatch", name: "不一致公式" },
      { ...baseRule, id: "rule-disabled", name: "停用公式", enabled: false },
    ];
    const cases: SampleCase[] = [
      {
        id: "pass",
        ruleId: "rule-pass",
        issue: "001",
        expectedRawResult: 115,
        expectedFinalResult: 19,
        expectedMappedResult: ["鼠"],
        expectedSuccess: true,
        sourceFile: "unit",
      },
      {
        id: "mismatch",
        ruleId: "rule-mismatch",
        issue: "001",
        expectedRawResult: 114,
        expectedFinalResult: 18,
        expectedMappedResult: ["牛"],
        expectedSuccess: false,
        sourceFile: "unit",
      },
    ];

    const backtest = runBacktest({ draws, rules, config: defaultConfig });
    const sampleResults = runSampleChecks({ cases, draws, rules, config: defaultConfig });
    const summaries = buildRuleValidationSummaries({ rules, backtest, sampleResults });

    expect(summaries.find((item) => item.ruleId === "rule-pass")).toMatchObject({
      status: "checked",
      label: "已核对",
      canJoinReference: true,
    });
    expect(summaries.find((item) => item.ruleId === "rule-pending")).toMatchObject({
      status: "unchecked",
      label: "未核对",
      canJoinReference: true,
    });
    expect(summaries.find((item) => item.ruleId === "rule-mismatch")).toMatchObject({
      status: "mismatch",
      label: "核对不一致",
      canJoinReference: true,
    });
    expect(summaries.find((item) => item.ruleId === "rule-disabled")).toMatchObject({
      status: "disabled",
      label: "已停用",
      canJoinReference: false,
    });
  });

  test("allows user-provided formulas without sample checks into the reference result", () => {
    const pendingRule = { ...baseRule, id: "pending-no-sample" };
    const confirmedRule = { ...baseRule, id: "confirmed-no-sample", manuallyConfirmed: true };
    const backtest = runBacktest({ draws, rules: [pendingRule, confirmedRule], config: defaultConfig });
    const summaries = buildRuleValidationSummaries({ rules: [pendingRule, confirmedRule], backtest, sampleResults: [] });

    expect(canRuleParticipateInReference(pendingRule, summaries.find((item) => item.ruleId === pendingRule.id))).toBe(true);
    expect(summaries.find((item) => item.ruleId === confirmedRule.id)).toMatchObject({ status: "unchecked", label: "未核对" });
    expect(canRuleParticipateInReference(confirmedRule, summaries.find((item) => item.ruleId === confirmedRule.id))).toBe(true);
  });

  test("marks ambiguous 位 variables as unchecked and excludes them from reference", () => {
    const badRule = { ...baseRule, id: "bad-variable", formula: "平位 + 特码尾" };
    const backtest = runBacktest({ draws, rules: [badRule], config: defaultConfig });
    const [summary] = buildRuleValidationSummaries({ rules: [badRule], backtest, sampleResults: [] });

    expect(summary).toMatchObject({
      status: "unchecked",
      label: "未核对",
      canJoinReference: false,
    });
  });

  test("marks other unknown variables as failed", () => {
    const badRule = { ...baseRule, id: "unknown-variable", formula: "未知变量 + 特码尾" };
    const backtest = runBacktest({ draws, rules: [badRule], config: defaultConfig });
    const [summary] = buildRuleValidationSummaries({ rules: [badRule], backtest, sampleResults: [] });

    expect(summary).toMatchObject({
      status: "failed",
      label: "计算异常",
      canJoinReference: false,
    });
  });
});
