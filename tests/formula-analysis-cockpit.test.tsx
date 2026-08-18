// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaAnalysisOverview } from "@/components/formula-analysis/formula-analysis-overview";
import { FormulaLandingWorkspace } from "@/components/formula-analysis/formula-landing-workspace";
import { FormulaHealthWorkspace } from "@/components/formula-analysis/formula-health-workspace";
import { FormulaEvidenceWorkspace } from "@/components/formula-analysis/formula-evidence-workspace";
import { FormulaAnalysisComparison } from "@/components/formula-analysis/formula-analysis-comparison";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";
import { buildFormulaAnalysisReport, clearFormulaAnalysisReportCache } from "@/lib/formula-analysis/build-analysis-report";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function makeReport(): FormulaAnalysisReport {
  clearFormulaAnalysisReportCache();
  const report = buildFormulaAnalysisReport({
    draws: seedDraws.slice(-20),
    rules: seedRules.filter((rule) => rule.enabled).slice(0, 8),
    config: defaultConfig,
    window: 10,
    action: "exclude",
    targetType: "zodiac",
    source: { label: "实时网址", updatedAt: "2026-08-16T00:00:00.000Z" },
    now: "2026-08-18T12:00:00.000Z",
  });
  return {
    ...report,
    dataHealth: { ...report.dataHealth, freshness: "stale", status: "attention" },
    landing: {
      ...report.landing,
      records: report.landing.records.map((record, index) => ({
        ...record,
        count: index === 0 ? 0 : index % 4,
        rank: index < 2 ? 1 : index % 5 + 1,
        tieCount: index < 2 ? 2 : 1,
        rankLabel: index < 2 ? "并列第 1 位" : `第 ${index % 5 + 1} 位`,
      })),
    },
  };
}

async function render(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
  return host;
}

function click(button: Element) {
  return act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("formula analysis overview", () => {
  it("shows one primary KPI, three supporting KPIs, plain coverage, health, and stale data copy", async () => {
    const report = makeReport();
    const view = await render(<FormulaAnalysisOverview report={report} onOpenEvidence={vi.fn()} onOpenLanding={vi.fn()} onOpenDiagnostics={vi.fn()} />);

    expect(view.querySelectorAll("[data-analysis-kpi]")).toHaveLength(4);
    expect(view.querySelector('[data-analysis-kpi="primary"]')?.textContent).toContain("实际落点平均被排除");
    expect(view.textContent).toContain("落在前三位");
    expect(view.textContent).toContain("平均位置");
    expect(view.textContent).toContain("最高被排除");
    expect(view.textContent).toContain("已覆盖最近10个已开奖期");
    expect(view.textContent).toContain("数据超过36小时未更新");
    expect(view.textContent).toContain(report.landing.insight);
    expect(view.querySelectorAll("[data-overview-record]")).toHaveLength(3);
    expect(view.querySelectorAll("[data-landing-issue]")).toHaveLength(10);
    expect(view.textContent).toContain("查看完整落点趋势");
    expect(view.textContent).toContain("查看公式诊断");
  });

  it("uses one contextual evidence action after a period is selected", async () => {
    const report = makeReport();
    const onOpenEvidence = vi.fn();
    const view = await render(<FormulaAnalysisOverview report={report} onOpenEvidence={onOpenEvidence} onOpenLanding={vi.fn()} onOpenDiagnostics={vi.fn()} />);
    expect(view.textContent).not.toContain("查看此期明细");

    const row = view.querySelectorAll("[data-overview-record]")[1];
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("aria-pressed")).toBe("false");
    await click(row);
    const action = [...view.querySelectorAll("button")].find((button) => button.textContent?.includes("查看此期明细"));
    expect(action).toBeDefined();
    expect(view.querySelectorAll("button")).toSatisfy((buttons: NodeListOf<HTMLButtonElement>) => (
      [...buttons].filter((button) => button.textContent?.includes("查看此期明细")).length === 1
    ));
    await click(action!);
    expect(onOpenEvidence).toHaveBeenCalledWith(report.landing.records.at(-2));
  });
});

describe("formula analysis comparison", () => {
  it("turns comparison mode into a visible current-versus-baseline analysis", async () => {
    const current = makeReport();
    const comparison = { ...makeReport(), window: 30 as const, landing: { ...makeReport().landing, kpis: { ...makeReport().landing.kpis, averageCount: 1.2, averageRank: 8 } } };
    const view = await render(<FormulaAnalysisComparison current={current} comparison={comparison} />);

    expect(view.textContent).toContain("对比结论");
    expect(view.textContent).toContain("最近10期");
    expect(view.textContent).toContain("最近30期");
    expect(view.querySelectorAll("[data-comparison-metric]")).toHaveLength(4);
    expect(view.textContent).toContain("平均次数变化");
  });
});

describe("formula landing workspace", () => {
  it("renders one coordinated count-and-rank chart with direct actual labels and 44px controls", async () => {
    const report = makeReport();
    const onSelectRecord = vi.fn();
    const view = await render(<FormulaLandingWorkspace report={report} onSelectRecord={onSelectRecord} />);

    expect(view.textContent).toContain("柱形看次数，折线看位置");
    expect(view.querySelectorAll("[data-landing-issue]")).toHaveLength(10);
    expect(view.textContent).toContain(`${report.landing.records[0].actualLabel} · ${String(report.landing.records[0].specialNumber).padStart(2, "0")}`);
    const firstControl = view.querySelector<HTMLElement>("[data-landing-issue]")!;
    expect(firstControl.getAttribute("style")).toContain("width: 44px");
    await click(firstControl);
    expect(onSelectRecord).not.toHaveBeenCalled();
    expect(view.textContent).toContain("查看这一期公式明细");
    const evidenceAction = [...view.querySelectorAll("button")].find((button) => button.textContent?.includes("查看这一期公式明细"));
    await click(evidenceAction!);
    expect(onSelectRecord).toHaveBeenCalledWith(report.landing.records[0]);
  });

  it("shows exact zero-inclusive count bins and rank bins including ties", async () => {
    const report = makeReport();
    const view = await render(<FormulaLandingWorkspace report={report} onSelectRecord={vi.fn()} />);
    const buttons = [...view.querySelectorAll("button")];

    await click(buttons.find((button) => button.textContent?.includes("次数分布"))!);
    const countBins = [...view.querySelectorAll<HTMLButtonElement>("[data-count-bin]")];
    expect(countBins[0].dataset.countBin).toBe("0");
    expect(countBins.reduce((total, bin) => total + Number(bin.dataset.periods), 0)).toBe(10);
    await click(countBins[0]);
    expect(view.textContent).toContain("符合这个区间的期次");

    await click([...view.querySelectorAll("button")].find((button) => button.textContent?.includes("位置分布"))!);
    const rankBins = [...view.querySelectorAll<HTMLElement>("[data-rank-bin]")];
    expect(rankBins.some((bin) => bin.dataset.rankBin === "1" && bin.textContent?.includes("并列"))).toBe(true);
    expect(rankBins.reduce((total, bin) => total + Number(bin.dataset.periods), 0)).toBe(10);
    expect(view.textContent).toContain("只统计已开奖期，待开奖期不进入分布");
  });
});

describe("formula health workspace", () => {
  it("shows exact 10/30/50 samples, understandable status copy, filters, and technical disclosure", async () => {
    const report = makeReport();
    const row = report.health.rows[0];
    const view = await render(<FormulaHealthWorkspace report={report} onOpenIssue={vi.fn()} />);

    expect(view.querySelector('input[aria-label="搜索公式"]')).not.toBeNull();
    expect(view.textContent).toContain("状态筛选");
    expect(view.textContent).toContain("排序方式");
    expect(view.querySelectorAll("[data-health-row]").length).toBe(report.health.rows.length);
    expect(view.textContent).toContain(`${row.windows[10].successRate}%`);
    expect(view.textContent).toContain(`${row.windows[10].successes}/${row.windows[10].sampleSize}`);
    expect(view.textContent).toContain(`${row.windows[30].successes}/${row.windows[30].sampleSize}`);
    expect(view.textContent).toContain(`${row.windows[50].successes}/${row.windows[50].sampleSize}`);
    expect(view.textContent).toContain("连续未通过");
    expect(view.textContent).toContain("样本不足");
    expect(view.querySelector("details")?.textContent).toContain("最近未通过期次");
    expect(view.querySelectorAll("[data-health-status-filter]")).toHaveLength(5);
    const firstStatus = row.status;
    await click(view.querySelector(`[data-health-status-filter="${firstStatus}"]`)!);
    expect(view.querySelectorAll("[data-health-row]")).toHaveLength(report.health.counts[firstStatus]);
  });

  it("explains duplicate and conflict thresholds with common samples and issue drill-down", async () => {
    const base = makeReport();
    const pair = {
      kind: "duplicate" as const,
      leftRuleId: "left",
      leftRuleName: "公式甲",
      rightRuleId: "right",
      rightRuleName: "公式乙",
      targetType: "zodiac" as const,
      commonPeriods: 10,
      score: 0.86,
      exactMatchPeriods: 8,
      overlapPeriods: 9,
      exampleIssues: ["2026210"],
    };
    const report = { ...base, pairs: { ...base.pairs, duplicates: [pair], conflicts: [{ ...pair, kind: "conflict" as const }] } };
    const onOpenIssue = vi.fn();
    const view = await render(<FormulaHealthWorkspace report={report} onOpenIssue={onOpenIssue} />);

    expect(view.textContent).toContain("高度重复");
    expect(view.textContent).toContain("方向冲突");
    expect(view.textContent).toContain("共同样本 10 期");
    expect(view.textContent).toContain("相似度 86%");
    expect(view.textContent).toContain("重复阈值 80%");
    const issue = view.querySelector<HTMLButtonElement>('[data-pair-issue="2026210"]')!;
    await click(issue);
    expect(onOpenIssue).toHaveBeenCalledWith("2026210");
  });
});

describe("formula evidence workspace", () => {
  it("keeps the complete domain, pending period, one toolbar, searchable rows, and one selected detail", async () => {
    const report = makeReport();
    const view = await render(<FormulaEvidenceWorkspace report={report} initialRecord={report.landing.records[0]} />);

    expect(view.querySelectorAll("[data-matrix-target]")).toHaveLength(12);
    expect(view.textContent).toContain("待开奖");
    expect(view.querySelectorAll("[data-evidence-toolbar]")).toHaveLength(1);
    expect(view.querySelector('input[aria-label="搜索贡献公式"]')).not.toBeNull();
    expect(view.textContent).toContain("期次 × 全部结果");
    expect(view.querySelectorAll("[data-evidence-detail]").length).toBeLessThanOrEqual(1);
    expect((view.textContent?.match(/查看/g) ?? [])).toHaveLength(0);
  });

  it("shows honest zero evidence after selecting a zero-count matrix cell", async () => {
    const report = makeReport();
    const view = await render(<FormulaEvidenceWorkspace report={report} />);
    const zeroCell = [...view.querySelectorAll<HTMLButtonElement>("[data-matrix-cell]")]
      .find((cell) => cell.textContent?.trim() === "0");
    expect(zeroCell).toBeDefined();
    await click(zeroCell!);

    expect(view.textContent).toContain("当前选择是 0 次，没有贡献公式");
    expect(view.querySelectorAll("[data-evidence-row]")).toHaveLength(0);
  });
});
