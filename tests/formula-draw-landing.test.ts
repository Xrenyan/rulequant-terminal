import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import {
  buildFormulaDrawLandingAnalysis,
  buildFormulaTargetDomain,
  resolveFormulaActualTarget,
} from "@/lib/formula-summary/formula-draw-landing";
import type {
  FormulaSummaryContribution,
  FormulaSummaryPeriod,
  FormulaSummaryTargetResult,
} from "@/lib/formula-summary/formula-summary";

const actual14: FormulaSummaryTargetResult = {
  issue: "102",
  number: 14,
  zodiac: "蛇",
  tail: 4,
  head: 1,
  sum: 5,
  segment: 2,
  element: "水",
  color: "蓝",
  parity: "双",
};

function zodiacContribution(issue: string, ruleId: string, targets: string[]): FormulaSummaryContribution {
  return {
    id: `${issue}:${ruleId}`,
    calculationIssue: issue,
    targetIssue: String(Number(issue) + 1),
    targetLabel: String(Number(issue) + 1),
    isPending: false,
    ruleId,
    ruleName: ruleId,
    category: "kill_zodiac",
    formula: "平1",
    expression: "平1",
    action: "exclude",
    targetType: "zodiac",
    targets,
    process: [],
  };
}

function completedPeriod(
  calculationIssue: string,
  zodiac: string,
  contributions: FormulaSummaryContribution[],
): FormulaSummaryPeriod {
  const targetIssue = String(Number(calculationIssue) + 1);
  return {
    calculationIssue,
    targetIssue,
    targetLabel: targetIssue,
    isPending: false,
    targetResult: { ...actual14, issue: targetIssue, zodiac },
    contributions,
    skippedRules: [],
  };
}

describe("formula draw landing domains", () => {
  it.each([
    ["zodiac", 12, "马", "羊"],
    ["tail", 10, "0", "9"],
    ["head", 5, "0", "4"],
    ["sum", 13, "1", "13"],
    ["segment", 7, "1", "7"],
    ["element", 5, "金", "土"],
    ["color", 3, "红", "绿"],
    ["half-head", 10, "0头单", "4头双"],
    ["half-color", 6, "红波单", "绿波双"],
    ["door", 5, "1门", "5门"],
    ["number", 49, "01", "49"],
  ] as const)("builds the complete %s domain", (targetType, size, first, last) => {
    const domain = buildFormulaTargetDomain(targetType, defaultConfig);
    expect(domain).toHaveLength(size);
    expect(domain[0].label).toBe(first);
    expect(domain.at(-1)?.label).toBe(last);
  });
});

describe("formula draw landing analysis", () => {
  it("counts unique matching targets and gives actual landings competition ranks", () => {
    const periods = [
      completedPeriod("101", "龙", [
        zodiacContribution("101", "r1", ["龙", "兔", "龙"]),
        zodiacContribution("101", "r2", ["龙"]),
      ]),
      completedPeriod("102", "龙", [
        zodiacContribution("102", "r1", ["龙"]),
        zodiacContribution("102", "r2", ["兔"]),
        zodiacContribution("102", "r3", ["兔"]),
      ]),
      completedPeriod("103", "龙", []),
    ];

    const analysis = buildFormulaDrawLandingAnalysis({
      periods,
      action: "exclude",
      targetType: "zodiac",
      config: defaultConfig,
    });

    expect(analysis.records.map((record) => ({
      issue: record.targetIssue,
      label: record.actualLabel,
      count: record.count,
      rank: record.rank,
    }))).toEqual([
      { issue: "102", label: "龙", count: 2, rank: 1 },
      { issue: "103", label: "龙", count: 1, rank: 2 },
      { issue: "104", label: "龙", count: 0, rank: 1 },
    ]);
    expect(analysis.kpis).toEqual({
      averageCount: 1,
      topThreePeriods: 3,
      averageRank: 1.3,
      maxCount: 2,
    });
    expect(analysis.insight).toBe("最近3个已开奖期中，实际开奖落点平均被排除次数为1次，3期落在前三位；最近一期实际开奖落点为龙，被排除次数为0次，并列第 1 位。");
  });

  it("uses neutral support terminology in insight copy", () => {
    const analysis = buildFormulaDrawLandingAnalysis({
      periods: [
        completedPeriod("101", "龙", []),
        completedPeriod("102", "龙", []),
      ],
      action: "include",
      targetType: "zodiac",
      config: defaultConfig,
    });

    expect(analysis.insight).toBe("最近2个已开奖期中，实际开奖落点平均被支持次数为0次，2期落在前三位；最近一期实际开奖落点为龙，被支持次数为0次，并列第 1 位。");
  });

  it("treats zero completed and matrix limits as empty windows", () => {
    const periods = [
      completedPeriod("101", "龙", []),
      completedPeriod("102", "龙", []),
    ];

    const analysis = buildFormulaDrawLandingAnalysis({
      periods,
      action: "exclude",
      targetType: "zodiac",
      config: defaultConfig,
      completedLimit: 0,
      matrixLimit: 0,
    });

    expect(analysis.records).toEqual([]);
    expect(analysis.matrixPeriods).toEqual([]);
    expect(analysis.series.every((series) => series.values.length === 0 && series.total === 0)).toBe(true);
    expect(analysis.insight).toBe("当前暂无已开奖期可验证实际结果。");
  });

  it("labels tied actual landings using standard competition rank", () => {
    const analysis = buildFormulaDrawLandingAnalysis({
      periods: [completedPeriod("101", "兔", [
        zodiacContribution("101", "r1", ["龙", "兔", "虎", "牛"]),
        zodiacContribution("101", "r2", ["龙", "兔", "虎"]),
        zodiacContribution("101", "r3", ["龙", "兔", "虎"]),
        zodiacContribution("101", "r4", ["龙"]),
      ])],
      action: "exclude",
      targetType: "zodiac",
      config: defaultConfig,
    });

    const tiedRecord = analysis.records[0];
    expect(tiedRecord.rank).toBe(2);
    expect(tiedRecord.tieCount).toBe(2);
    expect(tiedRecord.rankLabel).toBe("并列第 2 位");
  });

  it("uses separate completed, matrix, pending, and warning windows", () => {
    const completed = Array.from({ length: 11 }, (_, index) => (
      completedPeriod(String(101 + index), "龙", [])
    ));
    const periods: FormulaSummaryPeriod[] = [
      ...completed,
      {
        calculationIssue: "112",
        targetLabel: "下期待开奖",
        isPending: true,
        contributions: [],
        skippedRules: [],
      },
      {
        calculationIssue: "113",
        targetIssue: "114",
        targetLabel: "114",
        isPending: false,
        targetResultWarning: "号码必须在 1-49 之间",
        contributions: [],
        skippedRules: [],
      },
    ];

    const analysis = buildFormulaDrawLandingAnalysis({
      periods,
      action: "exclude",
      targetType: "zodiac",
      config: defaultConfig,
    });

    expect(analysis.records.map((record) => record.targetIssue)).toEqual([
      "103", "104", "105", "106", "107", "108", "109", "110", "111", "112",
    ]);
    expect(analysis.matrixPeriods.map((period) => period.calculationIssue)).toEqual([
      "104", "105", "106", "107", "108", "109", "110", "111", "112", "113",
    ]);
    expect(analysis.pendingPeriod?.calculationIssue).toBe("112");
    expect(analysis.warningCount).toBe(1);
  });

  it.each([
    ["zodiac", "蛇"],
    ["tail", "4"],
    ["head", "1"],
    ["sum", "5"],
    ["segment", "2"],
    ["element", "水"],
    ["color", "蓝"],
    ["half-head", "1头双"],
    ["half-color", "蓝波双"],
    ["door", "2门"],
    ["number", "14"],
  ] as const)("resolves the actual %s landing", (targetType, label) => {
    expect(resolveFormulaActualTarget(actual14, targetType).label).toBe(label);
  });
});
