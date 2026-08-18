// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaAnalysisOverview } from "@/components/formula-analysis/formula-analysis-overview";
import { FormulaLandingWorkspace } from "@/components/formula-analysis/formula-landing-workspace";
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
    const view = await render(<FormulaAnalysisOverview report={report} onOpenEvidence={vi.fn()} />);

    expect(view.querySelectorAll("[data-analysis-kpi]")).toHaveLength(4);
    expect(view.querySelector('[data-analysis-kpi="primary"]')?.textContent).toContain("实际落点平均被排除");
    expect(view.textContent).toContain("落在前三位");
    expect(view.textContent).toContain("平均位置");
    expect(view.textContent).toContain("最高被排除");
    expect(view.textContent).toContain("已覆盖最近10个已开奖期");
    expect(view.textContent).toContain("数据超过36小时未更新");
    expect(view.textContent).toContain(report.landing.insight);
    expect(view.querySelectorAll("[data-overview-record]")).toHaveLength(3);
  });

  it("uses one contextual evidence action after a period is selected", async () => {
    const report = makeReport();
    const onOpenEvidence = vi.fn();
    const view = await render(<FormulaAnalysisOverview report={report} onOpenEvidence={onOpenEvidence} />);
    expect(view.textContent).not.toContain("查看此期明细");

    const row = view.querySelectorAll("[data-overview-record]")[1];
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

describe("formula landing workspace", () => {
  it("renders separate aligned count and rank charts with direct actual labels and 44px controls", async () => {
    const report = makeReport();
    const onSelectRecord = vi.fn();
    const view = await render(<FormulaLandingWorkspace report={report} onSelectRecord={onSelectRecord} />);

    expect(view.textContent).toContain("被排除次数 · 越高代表同时排除它的公式越多");
    expect(view.textContent).toContain("当期位置 · 第1位在最上方");
    expect(view.querySelectorAll("[data-count-point]")).toHaveLength(10);
    expect(view.querySelectorAll("[data-rank-point]")).toHaveLength(10);
    expect(view.querySelectorAll("[data-landing-period-control]")).toHaveLength(10);
    expect(view.textContent).toContain(`${report.landing.records[0].actualLabel} · ${String(report.landing.records[0].specialNumber).padStart(2, "0")}`);
    const firstControl = view.querySelector<HTMLElement>("[data-landing-period-control]")!;
    expect(firstControl.className).toContain("min-h-11");
    await click(firstControl);
    expect(onSelectRecord).toHaveBeenCalledWith(report.landing.records[0]);
  });

  it("shows exact zero-inclusive count bins and rank bins including ties", async () => {
    const report = makeReport();
    const view = await render(<FormulaLandingWorkspace report={report} onSelectRecord={vi.fn()} />);
    const buttons = [...view.querySelectorAll("button")];

    await click(buttons.find((button) => button.textContent?.includes("次数分布"))!);
    const countBins = [...view.querySelectorAll<HTMLElement>("[data-count-bin]")];
    expect(countBins[0].dataset.countBin).toBe("0");
    expect(countBins.reduce((total, bin) => total + Number(bin.dataset.periods), 0)).toBe(10);

    await click([...view.querySelectorAll("button")].find((button) => button.textContent?.includes("位置分布"))!);
    const rankBins = [...view.querySelectorAll<HTMLElement>("[data-rank-bin]")];
    expect(rankBins.some((bin) => bin.dataset.rankBin === "1" && bin.textContent?.includes("并列"))).toBe(true);
    expect(rankBins.reduce((total, bin) => total + Number(bin.dataset.periods), 0)).toBe(10);
    expect(view.textContent).toContain("只统计已开奖期，待开奖期不进入分布");
  });
});
