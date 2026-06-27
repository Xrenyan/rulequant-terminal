import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { buildFormulaLedger, buildOneClickFormulaResults } from "@/lib/formula-ledger/formula-ledger";
import { getNumberAttributes } from "@/lib/engine/attributes";
import { runBacktest } from "@/lib/backtest/run-backtest";
import type { DrawRecord, RuleRecord } from "@/types/domain";

describe("formula ledger", () => {
  it("builds per-period calculation ledger rows for a rule", () => {
    const draws: DrawRecord[] = [
      { issue: "2026151", date: "2026-05-31", n1: 13, n2: 28, n3: 7, n4: 41, n5: 2, n6: 36, special: 19 },
      { issue: "2026152", date: "2026-06-01", n1: 1, n2: 14, n3: 22, n4: 35, n5: 40, n6: 45, special: 8 },
    ];
    const result = runBacktest({ draws, rules: [seedRules[0]], config: seedConfig });
    const ledger = buildFormulaLedger(result.ruleResults[0]);
    const first = ledger.entries.find((entry) => entry.currentIssue === "2026151")!;

    expect(ledger.summary.ruleName).toBe("L序杀一肖 - 样例核心");
    expect(first.currentIssue).toBe("2026151");
    expect(first.currentNumbersLabel).toBe([13, 28, 7, 41, 2, 36].map((number) => `${String(number).padStart(2, "0")} ${getNumberAttributes(number, seedConfig).zodiac}`).join(" ") + ` + 19 ${getNumberAttributes(19, seedConfig).zodiac}`);
    expect(first.variableLine).toContain("平1=13");
    expect(first.variableLine).toContain("特码尾=9");
    expect(first.equationLine).toBe("13 + 28 + 9 + 6 + 59 = 115");
    expect(first.rawResult).toBe(115);
    expect(first.mappingLine).toContain("19 对应鼠");
    expect(first.finalOutputLabel).toBe("杀鼠");
    expect(first.nextOpenLabel).toBe(`2026152期开奖：08 ${getNumberAttributes(8, seedConfig).zodiac}`);
    expect(first.statusText).toBe("正确");
    expect(first.compactLine).toContain("2026151期13 + 28 + 9 + 6 + 59 = 115");
  });

  it("marks failed periods clearly", () => {
    const draws: DrawRecord[] = [
      { issue: "001", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
      { issue: "002", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 13 },
    ];
    const rule: RuleRecord = {
      id: "fail-rule",
      name: "失败样例",
      category: "kill_zodiac",
      orderMode: "L",
      formula: "平1",
      normalizer: "auto",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    };
    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const ledger = buildFormulaLedger(result.ruleResults[0]);

    expect(ledger.summary.failedIssues).toEqual(["001"]);
    expect(ledger.entries[0]).toMatchObject({
      isFailure: true,
      statusText: "错误",
      finalOutputLabel: "杀马",
      nextOpenLabel: `002期开奖：13 ${getNumberAttributes(13, defaultConfig).zodiac}`,
    });
  });

  it("adds the latest draw as a pending ledger row before the next draw exists", () => {
    const draws: DrawRecord[] = [
      { issue: "2026175", n1: 7, n2: 19, n3: 30, n4: 29, n5: 28, n6: 25, special: 26 },
      { issue: "2026176", n1: 30, n2: 31, n3: 2, n4: 36, n5: 38, n6: 15, special: 10 },
    ];
    const rule: RuleRecord = {
      id: "pending-latest-rule",
      name: "最新期待验证",
      category: "kill_zodiac",
      orderMode: "L",
      formula: "平1 + 平2 + 特码尾 + 总数尾 + 59",
      normalizer: "auto",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    };
    const result = runBacktest({ draws, rules: [rule], config: defaultConfig });
    const ledger = buildFormulaLedger(result.ruleResults[0], { draws, config: defaultConfig });
    const latest = ledger.entries.at(-1)!;

    expect(ledger.summary.total).toBe(1);
    expect(latest.currentIssue).toBe("2026176");
    expect(latest.statusText).toBe("待验证");
    expect(latest.isPending).toBe(true);
    expect(latest.nextOpenLabel).toContain("待下一期开奖");
    expect(latest.variableLine).toContain("平1=30");
    expect(latest.equationLine).toContain("=");
  });

  it("calculates all enabled rules for the selected latest draw", () => {
    const rows = buildOneClickFormulaResults({
      draw: seedDraws.at(-1)!,
      rules: seedRules,
      config: seedConfig,
    });

    expect(rows).toHaveLength(seedRules.filter((rule) => rule.enabled).length);
    expect(rows[0]).toMatchObject({
      ruleName: expect.any(String),
      formula: expect.any(String),
      equationLine: expect.stringContaining("="),
      finalOutputLabel: expect.any(String),
    });
  });
});
