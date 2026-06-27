import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { clearBacktestCache, getBacktestCacheSize, runBacktest } from "@/lib/backtest/run-backtest";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const draws: DrawRecord[] = [
  { issue: "001", n1: 13, n2: 28, n3: 7, n4: 41, n5: 2, n6: 36, special: 19 },
  { issue: "002", n1: 1, n2: 14, n3: 22, n4: 35, n5: 40, n6: 45, special: 8 },
  { issue: "003", n1: 5, n2: 16, n3: 21, n4: 32, n5: 39, n6: 44, special: 33 },
  { issue: "004", n1: 2, n2: 9, n3: 18, n4: 27, n5: 36, n6: 49, special: 12 },
];

const baseRule: Omit<RuleRecord, "id" | "name" | "category" | "formula" | "normalizer" | "target"> = {
  orderMode: "L",
  verifyMode: "next_special",
  positionPattern: [],
  periodSpan: 1,
  enabled: true,
  tags: ["test"],
  description: "",
  sourceFile: "unit",
  examples: [],
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
};

describe("backtest engine", () => {
  test("caches identical backtest runs", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "cache-backtest",
      name: "回测缓存",
      category: "kill_zodiac",
      formula: "平1 + 平2 + 特码尾",
      normalizer: "subtract_48_to_1_49",
      target: "special_zodiac",
    };

    clearBacktestCache();
    runBacktest({ draws, rules: [rule], config: defaultConfig });
    runBacktest({ draws, rules: [rule], config: defaultConfig });

    expect(getBacktestCacheSize()).toBe(1);
  });

  test("runs kill zodiac with detailed calculation process", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "kill-zodiac",
      name: "杀鼠样例",
      category: "kill_zodiac",
      formula: "平1 + 平2 + 特码尾 + 总数尾 + 59",
      normalizer: "subtract_48_to_1_49",
      target: "special_zodiac",
    };

    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const detail = result.ruleResults[0].details[0];

    expect(result.ruleResults[0]).toMatchObject({
      total: 3,
      success: 3,
      failed: 0,
      successRate: 100,
      currentStreak: 3,
      maxStreak: 3,
    });
    expect(detail.rawResult).toBe(115);
    expect(detail.finalResult).toBe(19);
    expect(detail.mappedResult).toEqual(["鼠"]);
    expect(detail.success).toBe(true);
    expect(detail.process).toContain("115 - 48 = 67");
  });

  test("runs seven tail as an inclusion rule", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "seven-tail",
      name: "七尾样例",
      category: "seven_tail",
      formula: "特码尾",
      normalizer: "tail_offsets",
      target: "special_tail",
    };

    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });

    expect(result.ruleResults[0].details[0].mappedResult).toEqual([6, 7, 8, 9, 0, 1, 3]);
    expect(result.ruleResults[0].details[0].success).toBe(true);
  });

  test("runs eight zodiac two period and records each future issue", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "eight-two",
      name: "八肖管两期",
      category: "eight_zodiac_two_period",
      formula: "平6",
      normalizer: "eight_zodiac_two_period",
      target: "special_zodiac",
      periodSpan: 2,
    };

    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const first = result.ruleResults[0].details[0];

    expect(first.mappedResult).toHaveLength(8);
    expect(first.futureChecks).toHaveLength(2);
    expect(first.futureChecks.map((item) => item.issue)).toEqual(["002", "003"]);
  });

  test("uses the period position pattern for eight zodiac rules", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "eight-cycle",
      name: "八肖循环取位",
      category: "eight_zodiac",
      formula: "平1",
      normalizer: "eight_zodiac",
      target: "special_zodiac",
      positionPattern: [1, 2, 3],
    };

    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const details = result.ruleResults[0].details;

    expect(details[0].formula).toBe("平1");
    expect(details[0].variables).toHaveProperty("平1", draws[0].n1);
    expect(details[1].formula).toBe("平2");
    expect(details[1].variables).toHaveProperty("平2", draws[1].n2);
    expect(details[2].formula).toBe("平3");
    expect(details[2].variables).toHaveProperty("平3", draws[2].n3);
  });

  test("uses the period position pattern for kill-three-as-nine rules", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "kill-three-cycle",
      name: "杀三肖循环取位",
      category: "kill_three_as_nine",
      formula: "平7",
      normalizer: "kill_three_as_nine",
      target: "special_zodiac",
      positionPattern: [7, 6, 5],
    };

    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const details = result.ruleResults[0].details;

    expect(details[0].formula).toBe("平7");
    expect(details[0].variables).toHaveProperty("平7", draws[0].special);
    expect(details[1].formula).toBe("平6");
    expect(details[1].variables).toHaveProperty("平6", draws[1].n6);
    expect(details[2].formula).toBe("平5");
    expect(details[2].variables).toHaveProperty("平5", draws[2].n5);
    expect(details[0].secondaryMappedResult?.length).toBe(3);
  });

  test("uses an optional position pattern for two-period eight zodiac rules", () => {
    const rule: RuleRecord = {
      ...baseRule,
      id: "eight-two-cycle",
      name: "八肖管两期循环取位",
      category: "eight_zodiac_two_period",
      formula: "平6",
      normalizer: "eight_zodiac_two_period",
      target: "special_zodiac",
      periodSpan: 2,
      positionPattern: [6, 5],
    };

    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const details = result.ruleResults[0].details;

    expect(details[0].formula).toBe("平6");
    expect(details[0].variables).toHaveProperty("平6", draws[0].n6);
    expect(details[1].formula).toBe("平5");
    expect(details[1].variables).toHaveProperty("平5", draws[1].n5);
  });

  test("aligns eight zodiac pattern with the real issue examples", () => {
    const realIssueDraws: DrawRecord[] = [
      { issue: "2026169", n1: 44, n2: 1, n3: 2, n4: 3, n5: 4, n6: 5, special: 3 },
      { issue: "2026170", n1: 1, n2: 46, n3: 2, n4: 3, n5: 4, n6: 5, special: 28 },
      { issue: "2026171", n1: 1, n2: 2, n3: 40, n4: 3, n5: 4, n6: 5, special: 44 },
      { issue: "2026172", n1: 28, n2: 34, n3: 42, n4: 37, n5: 45, n6: 8, special: 44 },
      { issue: "2026173", n1: 39, n2: 6, n3: 16, n4: 40, n5: 13, n6: 19, special: 26 },
      { issue: "2026174", n1: 15, n2: 8, n3: 34, n4: 13, n5: 28, n6: 21, special: 41 },
    ];
    const rule: RuleRecord = {
      ...baseRule,
      id: "eight-real-anchor",
      name: "八肖真实期号取位",
      category: "eight_zodiac",
      formula: "平1",
      normalizer: "eight_zodiac",
      target: "special_zodiac",
      positionPattern: [1, 2, 3, 4, 5, 6, 5, 4, 3, 2],
    };

    const result = runBacktest({ draws: realIssueDraws, rules: [rule], config: defaultConfig });
    const details = result.ruleResults[0].details;

    expect(details.map((detail) => detail.formula)).toEqual(["平1", "平2", "平3", "平4", "平5"]);
    expect(details[4].variables).toHaveProperty("平5", 13);
  });

  test("aligns kill-three-as-nine pattern with the real issue examples", () => {
    const realIssueDraws: DrawRecord[] = [
      { issue: "2026167", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 19 },
      { issue: "2026168", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 33, special: 15 },
      { issue: "2026169", n1: 1, n2: 2, n3: 3, n4: 4, n5: 40, n6: 5, special: 24 },
      { issue: "2026170", n1: 1, n2: 2, n3: 3, n4: 38, n5: 4, n6: 5, special: 3 },
      { issue: "2026171", n1: 1, n2: 2, n3: 40, n4: 3, n5: 4, n6: 5, special: 28 },
      { issue: "2026172", n1: 28, n2: 34, n3: 42, n4: 37, n5: 45, n6: 8, special: 44 },
      { issue: "2026173", n1: 39, n2: 6, n3: 16, n4: 40, n5: 13, n6: 19, special: 26 },
      { issue: "2026174", n1: 15, n2: 8, n3: 34, n4: 13, n5: 28, n6: 21, special: 41 },
    ];
    const rule: RuleRecord = {
      ...baseRule,
      id: "kill-three-real-anchor",
      name: "杀三肖真实期号取位",
      category: "kill_three_as_nine",
      formula: "平7",
      normalizer: "kill_three_as_nine",
      target: "special_zodiac",
      positionPattern: [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6],
    };

    const result = runBacktest({ draws: realIssueDraws, rules: [rule], config: defaultConfig });
    const details = result.ruleResults[0].details;

    expect(details.map((detail) => detail.formula)).toEqual(["平7", "平6", "平5", "平4", "平3", "平2", "平1"]);
    expect(details[6].variables).toHaveProperty("平1", 39);
  });
});
