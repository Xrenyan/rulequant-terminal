import { describe, expect, it } from "vitest";
import { buildFormulaHealthReport } from "@/lib/formula-analysis/formula-health";
import { defaultConfig } from "@/lib/config/default-config";
import type { DrawRecord, RuleRecord } from "@/types/domain";

function makeRule(id: string, category: RuleRecord["category"], formula = "平1"): RuleRecord {
  return {
    id,
    name: id,
    category,
    formula,
    enabled: true,
    orderMode: "L",
    normalizer: "auto",
    target: "next_special",
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    tags: [],
    description: "",
    sourceFile: "health-test",
    examples: [],
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
}

function drawsForKillOutcomes(outcomes: boolean[]): DrawRecord[] {
  const targetSpecials = outcomes.map((success) => success ? 14 : 13);
  return [14, ...targetSpecials].map((special, index) => ({
    issue: String(1000 + index),
    n1: 1,
    n2: 3,
    n3: 4,
    n4: 5,
    n5: 6,
    n6: 7,
    special,
  }));
}

describe("formula analysis health", () => {
  it("reuses formula-engine success semantics for exclusion and support rules", () => {
    const draws = drawsForKillOutcomes([true, false, true]);
    const report = buildFormulaHealthReport({
      draws,
      rules: [makeRule("杀马", "kill_zodiac"), makeRule("选马", "include_zodiac")],
      config: defaultConfig,
    });

    const exclude = report.rows.find((row) => row.ruleId === "杀马")!;
    const include = report.rows.find((row) => row.ruleId === "选马")!;

    expect(exclude.windows[10]).toMatchObject({ sampleSize: 3, successes: 2, failures: 1, successRate: 66.67 });
    expect(include.windows[10]).toMatchObject({ sampleSize: 3, successes: 1, failures: 2, successRate: 33.33 });
    expect(exclude.latestFailureIssues).toEqual(["1001"]);
    expect(include.latestFailureIssues).toEqual(["1002", "1000"]);
  });

  it("derives 10, 30 and 50-period metrics and consecutive-failure status", () => {
    const outcomes = [
      ...Array.from({ length: 5 }, () => true),
      ...Array.from({ length: 20 }, (_, index) => index < 13),
      ...Array.from({ length: 7 }, () => true),
      false,
      false,
      false,
    ];
    const report = buildFormulaHealthReport({
      draws: drawsForKillOutcomes(outcomes),
      rules: [makeRule("连续失败公式", "kill_zodiac")],
      config: defaultConfig,
    });
    const row = report.rows[0];

    expect(row.windows[10]).toEqual({ window: 10, sampleSize: 10, successes: 7, failures: 3, successRate: 70 });
    expect(row.windows[30]).toEqual({ window: 30, sampleSize: 30, successes: 20, failures: 10, successRate: 66.67 });
    expect(row.windows[50]).toEqual({ window: 50, sampleSize: 35, successes: 25, failures: 10, successRate: 71.43 });
    expect(row.currentSuccessStreak).toBe(0);
    expect(row.currentFailureStreak).toBe(3);
    expect(row.longestFailureStreak).toBe(7);
    expect(row.status).toBe("consecutive-failure");
    expect(report.counts["consecutive-failure"]).toBe(1);
  });

  it("marks a sufficiently sampled rule as volatile when recent and 30-period rates diverge", () => {
    const outcomes = [
      ...Array.from({ length: 20 }, () => false),
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      false,
      true,
      true,
    ];
    const report = buildFormulaHealthReport({
      draws: drawsForKillOutcomes(outcomes),
      rules: [makeRule("近期波动公式", "kill_zodiac")],
      config: defaultConfig,
    });
    const row = report.rows[0];

    expect(row.windows[10].successRate).toBe(80);
    expect(row.windows[30].successRate).toBe(26.67);
    expect(row.currentFailureStreak).toBe(0);
    expect(row.status).toBe("volatile");
  });

  it("distinguishes insufficient samples from calculation errors", () => {
    const draws = drawsForKillOutcomes([true, true, false, true]);
    const report = buildFormulaHealthReport({
      draws,
      rules: [
        makeRule("样本不足公式", "kill_zodiac"),
        makeRule("错误公式", "kill_zodiac", "不存在的变量 +"),
      ],
      config: defaultConfig,
    });

    expect(report.rows.find((row) => row.ruleId === "样本不足公式")?.status).toBe("sample-low");
    const error = report.rows.find((row) => row.ruleId === "错误公式")!;
    expect(error.status).toBe("calculation-error");
    expect(error.windows[10].sampleSize).toBe(0);
    expect(error.error).toBeTruthy();
    expect(report.counts["sample-low"]).toBe(1);
    expect(report.counts["calculation-error"]).toBe(1);
  });
});
