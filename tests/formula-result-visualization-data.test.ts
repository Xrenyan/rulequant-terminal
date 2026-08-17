import { describe, expect, it } from "vitest";
import {
  buildFormulaInsight,
  buildFormulaParetoRows,
  buildFormulaVisualizationModel,
  selectRankSeries,
} from "@/lib/formula-summary/formula-visualization";
import type {
  FormulaSummaryContribution,
  FormulaSummaryPeriod,
  FormulaSummaryTarget,
} from "@/lib/formula-summary/formula-summary";

function contribution(input: {
  issue: string;
  ruleId: string;
  targets: FormulaSummaryTarget[];
  ruleName?: string;
}): FormulaSummaryContribution {
  return {
    id: `${input.issue}:${input.ruleId}`,
    calculationIssue: input.issue,
    targetIssue: String(Number(input.issue) + 1),
    targetLabel: String(Number(input.issue) + 1),
    isPending: false,
    ruleId: input.ruleId,
    ruleName: input.ruleName ?? input.ruleId,
    category: "kill_zodiac",
    formula: "平1",
    expression: "平1",
    action: "exclude",
    targetType: "zodiac",
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

const periods = [
  period("101", [
    contribution({ issue: "101", ruleId: "r-a", targets: ["龙", "兔"] }),
    contribution({ issue: "101", ruleId: "r-b", targets: ["龙"] }),
  ]),
  period("102", [
    contribution({ issue: "102", ruleId: "r-a", targets: ["兔"] }),
    contribution({ issue: "102", ruleId: "r-b", targets: ["龙"] }),
    contribution({ issue: "102", ruleId: "r-c", targets: ["兔"] }),
  ]),
  period("103", [
    contribution({ issue: "103", ruleId: "r-a", targets: ["龙"] }),
    contribution({ issue: "103", ruleId: "r-b", targets: ["龙"] }),
    contribution({ issue: "103", ruleId: "r-c", targets: ["龙", "兔"] }),
  ]),
];

describe("formula visualization data", () => {
  it("derives complete period series, dense ranks, leaders, medians, and one global heatmap scale", () => {
    const model = buildFormulaVisualizationModel(periods, "exclude", "zodiac");

    expect(model.calculationIssues).toEqual(["101", "102", "103"]);
    expect(model.series.map((item) => item.label)).toEqual(["龙", "兔"]);
    expect(model.series[0]).toMatchObject({
      label: "龙",
      total: 6,
      values: [2, 1, 3],
      ranks: [1, 2, 1],
    });
    expect(model.series[1]).toMatchObject({
      label: "兔",
      total: 4,
      values: [1, 2, 1],
      ranks: [2, 1, 2],
    });
    expect(model.leaderValues).toEqual([2, 2, 3]);
    expect(model.leaderLabels).toEqual(["龙", "兔", "龙"]);
    expect(model.medianValues).toEqual([1.5, 1.5, 2]);
    expect(model.globalMax).toBe(3);
  });

  it("writes an evidence-based selected-result insight and keeps that result in the rank chart", () => {
    const model = buildFormulaVisualizationModel(periods, "exclude", "zodiac");
    const dragon = model.series.find((item) => item.label === "龙")!;
    const insight = buildFormulaInsight(model, dragon.targetKey);
    const visible = selectRankSeries(model, dragon.targetKey, 1);

    expect(insight).toContain("龙");
    expect(insight).toContain("最新 3 次");
    expect(insight).toContain("高于区间均值 50%");
    expect(insight).toContain("第 1 位");
    expect(visible.map((item) => item.targetKey)).toContain(dragon.targetKey);
  });

  it("builds a true Pareto series with a bounded remainder and a final 100% cumulative share", () => {
    const contributions = [
      ...Array.from({ length: 5 }, (_, index) => contribution({ issue: `${200 + index}`, ruleId: "r-a", ruleName: "公式甲", targets: ["龙"] })),
      ...Array.from({ length: 4 }, (_, index) => contribution({ issue: `${210 + index}`, ruleId: "r-b", ruleName: "公式乙", targets: ["龙"] })),
      ...Array.from({ length: 3 }, (_, index) => contribution({ issue: `${220 + index}`, ruleId: "r-c", ruleName: "公式丙", targets: ["龙"] })),
      ...Array.from({ length: 2 }, (_, index) => contribution({ issue: `${230 + index}`, ruleId: "r-d", ruleName: "公式丁", targets: ["龙"] })),
      contribution({ issue: "240", ruleId: "r-e", ruleName: "公式戊", targets: ["龙"] }),
    ];

    const rows = buildFormulaParetoRows(contributions, 4);

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.label)).toEqual(["公式甲", "公式乙", "公式丙", "其他公式"]);
    expect(rows.map((row) => row.count)).toEqual([5, 4, 3, 3]);
    expect(rows.map((row) => row.cumulativeShare)).toEqual([33.3, 60, 80, 100]);
    expect(rows.at(-1)).toMatchObject({ isRemainder: true, cumulativeShare: 100 });
  });
});
