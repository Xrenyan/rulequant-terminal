// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FormulaResultStatisticsView } from "@/components/formula-result-statistics-view";
import { defaultConfig } from "@/lib/config/default-config";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draws: DrawRecord[] = [
  { issue: "101", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "102", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
  { issue: "103", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
  { issue: "104", n1: 22, n2: 23, n3: 24, n4: 25, n5: 26, n6: 27, special: 28 },
];

const zeroLandingDraws: DrawRecord[] = [
  { issue: "100", n1: 3, n2: 4, n3: 5, n4: 6, n5: 7, n6: 8, special: 49 },
  { issue: "101", n1: 3, n2: 8, n3: 9, n4: 10, n5: 11, n6: 12, special: 7 },
  { issue: "102", n1: 3, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
  { issue: "103", n1: 3, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
  { issue: "104", n1: 3, n2: 23, n3: 24, n4: 25, n5: 26, n6: 27, special: 28 },
];

const zeroLandingConfig: RuleQuantConfig = {
  ...defaultConfig,
  zodiacTable: {
    ...defaultConfig.zodiacTable,
    马: [7, ...defaultConfig.zodiacTable.马.filter((number) => number !== 7)],
    鼠: defaultConfig.zodiacTable.鼠.filter((number) => number !== 7),
  },
};

function makeRule(id: string, formula: string): RuleRecord {
  return {
    id,
    name: id,
    category: "kill_zodiac",
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
    sourceFile: "unit",
    examples: [],
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  document.body.style.overflow = "";
  root = undefined;
  host = undefined;
});

function buttonByText(scope: ParentNode, text: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`没有找到按钮：${text}`);
  return button as HTMLButtonElement;
}

async function renderView({
  viewDraws = draws,
  rules = [makeRule("杀肖甲", "平1"), makeRule("杀肖乙", "平2"), makeRule("杀肖丙", "平3")],
  config = defaultConfig,
}: {
  viewDraws?: DrawRecord[];
  rules?: RuleRecord[];
  config?: RuleQuantConfig;
} = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(React.createElement(FormulaResultStatisticsView, {
      draws: viewDraws,
      rules,
      config,
    }));
  });
}

describe("formula result visualization", () => {
  it("opens a real modal, locks body scrolling, closes on Escape, and restores exact focus", async () => {
    await renderView();
    const trigger = buttonByText(host!, "查看可视化");
    trigger.focus();

    await act(async () => {
      trigger.click();
      await import("@/components/formula-result-visualization");
    });

    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("分析概览");
    expect(dialog?.textContent).toContain("自动洞察");
    expect(dialog?.textContent).toContain("公式贡献排行");
    expect(dialog?.textContent).toContain("相对趋势");
    expect(dialog?.textContent).toContain("十期排名轨迹");
    expect(dialog?.textContent).toContain("公式贡献帕累托");
    expect(dialog?.textContent).toContain("近十期开奖落点趋势");
    expect(dialog?.textContent).toContain("实际结果平均次数");
    expect(dialog?.textContent).toContain("落在前三期数");
    expect(dialog?.textContent).toContain("实际结果平均位置");
    expect(dialog?.textContent).toContain("单期最高次数");
    expect(dialog?.textContent).toContain("实际开奖落点记录");
    expect(dialog?.textContent).toContain("期次 × 全部结果");
    expect(dialog?.textContent).toContain("统一色阶");
    expect(dialog?.textContent).toContain("贡献公式明细");
    expect(dialog?.textContent).not.toContain("结果构成");
    expect(dialog?.querySelector('svg[aria-label*="中位数"]')).not.toBeNull();
    expect(dialog?.querySelector('svg[aria-label*="排名从"]')).not.toBeNull();
    expect(dialog?.querySelector('svg[aria-label*="第1位在上"]')).not.toBeNull();
    expect(dialog?.querySelector(".rq-formula-viz__heat-legend")).not.toBeNull();
    expect(dialog?.querySelector(".rq-formula-viz__target-chips")).not.toBeNull();
    const evidence = dialog?.querySelector(".rq-formula-viz__evidence-row") as HTMLDetailsElement | null;
    expect(evidence).not.toBeNull();
    if (evidence) evidence.open = true;
    expect(evidence?.textContent).toContain("计算过程");
    expect(evidence?.querySelector(".rq-formula-viz__process")).not.toBeNull();

    const sections = [...dialog!.querySelectorAll<HTMLElement>(".rq-formula-viz__body > section")];
    expect(sections.map((section) => section.getAttribute("aria-labelledby"))).toEqual([
      "formula-overview-title",
      "formula-trend-title",
      "formula-rank-title",
      "formula-trajectory-title",
      "formula-pareto-title",
      "formula-landing-title",
      "formula-matrix-title",
      "formula-evidence-title",
    ]);
    const interactiveLandingControls = [
      ...dialog!.querySelectorAll("[data-landing-record] button, [data-actual-landing='true']"),
    ];
    expect(interactiveLandingControls.length).toBeGreaterThan(0);
    expect(interactiveLandingControls.every((control) => control instanceof HTMLButtonElement)).toBe(true);
    const landingHeaders = [...dialog!.querySelectorAll(".rq-formula-viz__landing-records thead th")];
    expect(landingHeaders.map((header) => header.getAttribute("scope"))).toEqual([
      "col", "col", "col", "col", "col", "col", "col",
    ]);
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("cross-filters the dashboard when a chart result or period is selected", async () => {
    await renderView();
    await act(async () => {
      buttonByText(host!, "最近十期").click();
      buttonByText(host!, "查看可视化").click();
      await import("@/components/formula-result-visualization");
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    const targetControl = dialog.querySelector<HTMLButtonElement>('button[data-chart-target]');
    expect(targetControl).not.toBeNull();
    await act(async () => targetControl?.click());
    expect(targetControl?.getAttribute("aria-pressed")).toBe("true");

    const periodControl = dialog.querySelector<HTMLButtonElement>('button[data-period-issue]');
    expect(periodControl).not.toBeNull();
    await act(async () => periodControl?.click());
    expect(dialog.textContent).toContain("已聚焦计算期");
    expect(dialog.textContent).toContain(periodControl?.dataset.periodIssue);
    expect(dialog.querySelector(".rq-formula-viz__overview")?.textContent).toContain("/1");

    await act(async () => buttonByText(dialog, "清除期次筛选").click());
    expect(dialog.textContent).not.toContain("已聚焦计算期");
  });

  it("shares actual landing focus across the chart, records, matrix, and evidence", async () => {
    await renderView();
    await act(async () => {
      buttonByText(host!, "最近十期").click();
      buttonByText(host!, "查看可视化").click();
      await import("@/components/formula-result-visualization");
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    const record = [...dialog.querySelectorAll<HTMLTableRowElement>("[data-landing-record]")]
      .find((row) => !row.textContent?.includes("0条"));
    expect(record).toBeDefined();
    if (!record) throw new Error("fixture requires an actual landing with contributions");

    const issue = record.dataset.landingRecord!;
    const actualLabel = record.querySelector('td[data-label="实际特码 / 结果"] span')?.textContent?.replace(/^\s*·\s*/, "");
    expect(actualLabel).toBeTruthy();
    const viewButton = buttonByText(record, "查看");

    const expectFocusedActualEvidence = () => {
      expect(dialog.querySelector(".rq-formula-viz__active-filter")?.textContent).toContain(issue);
      const evidenceRows = [...dialog.querySelectorAll(".rq-formula-viz__evidence-row")];
      expect(evidenceRows.length).toBeGreaterThan(0);
      expect(evidenceRows.every((row) => row.textContent?.includes(`${issue} 计算`))).toBe(true);
      expect(evidenceRows.every((row) => row.querySelector(".rq-formula-viz__target-chips")?.textContent?.includes(actualLabel!))).toBe(true);
    };

    await act(async () => viewButton.click());
    expectFocusedActualEvidence();

    const chartPoint = dialog.querySelector<SVGGElement>(`[data-landing-issue="${issue}"]`);
    expect(chartPoint).not.toBeNull();
    await act(async () => chartPoint?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expectFocusedActualEvidence();

    const actualCell = [...dialog.querySelectorAll<HTMLButtonElement>('[data-actual-landing="true"]')]
      .find((cell) => cell.getAttribute("aria-label")?.includes(`${issue}计算期`));
    expect(actualCell).not.toBeNull();
    await act(async () => actualCell?.click());
    expectFocusedActualEvidence();
  });

  it("keeps a zero-count actual landing selected with zero values and empty evidence", async () => {
    await renderView({
      viewDraws: zeroLandingDraws,
      rules: [makeRule("杀肖甲", "平1"), makeRule("杀肖乙", "平1"), makeRule("杀肖丙", "平1")],
      config: zeroLandingConfig,
    });
    await act(async () => {
      buttonByText(host!, "最近十期").click();
      buttonByText(host!, "查看可视化").click();
      await import("@/components/formula-result-visualization");
    });

    const dialog = document.body.querySelector('[role="dialog"]')!;
    const zeroRecord = dialog.querySelector<HTMLTableRowElement>('[data-landing-record="100"]');
    expect(zeroRecord?.textContent).toContain("07 · 马");
    expect(zeroRecord?.textContent).toContain("0次");

    await act(async () => buttonByText(zeroRecord!, "查看").click());

    expect(dialog.querySelector(".rq-formula-viz__overview")?.textContent).toContain("当前结果累计0次");
    expect(dialog.querySelectorAll(".rq-formula-viz__evidence-row")).toHaveLength(0);
    expect(dialog.querySelector(".rq-formula-viz__evidence-panel .rq-formula-viz__empty")?.textContent).toContain("当前筛选暂无可追溯贡献记录");
    const actual = [...dialog.querySelectorAll<HTMLButtonElement>('[data-actual-landing="true"]')]
      .find((cell) => cell.getAttribute("aria-label")?.includes("100计算期"));
    expect(actual?.getAttribute("aria-pressed")).toBe("true");
  });

  it("closes through the accessible backdrop control and restores focus again", async () => {
    await renderView();
    const trigger = buttonByText(host!, "查看可视化");
    trigger.focus();
    await act(async () => {
      trigger.click();
      await import("@/components/formula-result-visualization");
    });

    const backdrop = document.body.querySelector('button[aria-label="关闭可视化"]') as HTMLButtonElement | null;
    expect(backdrop).not.toBeNull();
    await act(async () => backdrop?.click());

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps keyboard focus inside the visualization sheet", async () => {
    await renderView();
    const trigger = buttonByText(host!, "查看可视化");
    await act(async () => {
      trigger.click();
      await import("@/components/formula-result-visualization");
    });
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])')];
    const first = controls[0];
    const last = controls.at(-1)!;

    last.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(first);

    first.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(last);
  });
});
