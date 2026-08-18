// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaDrawLandingChart } from "@/components/formula-draw-landing-chart";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const records: FormulaDrawLandingRecord[] = [
  { calculationIssue: "101", targetIssue: "102", specialNumber: 14, actualTarget: "龙", actualTargetKey: "string:龙", actualLabel: "龙", count: 2, rank: 1, tieCount: 1, rankLabel: "第 1 位", contributions: [] },
  { calculationIssue: "102", targetIssue: "103", specialNumber: 21, actualTarget: "兔", actualTargetKey: "string:兔", actualLabel: "兔", count: 1, rank: 3, tieCount: 1, rankLabel: "第 3 位", contributions: [] },
  { calculationIssue: "103", targetIssue: "104", specialNumber: 28, actualTarget: "虎", actualTargetKey: "string:虎", actualLabel: "虎", count: 3, rank: 2, tieCount: 2, rankLabel: "并列第 2 位", contributions: [] },
];

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function renderChart(
  chartRecords: FormulaDrawLandingRecord[],
  { focusedIssue = "all", onFocusIssue = vi.fn(), onFocusRecord }: {
    focusedIssue?: string;
    onFocusIssue?: (issue: string) => void;
    onFocusRecord?: (record: FormulaDrawLandingRecord) => void;
  } = {},
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <FormulaDrawLandingChart
      records={chartRecords}
      focusedIssue={focusedIssue}
      unitLabel="被排除次数"
      onFocusIssue={onFocusIssue}
      onFocusRecord={onFocusRecord}
    />,
  ));
  return host;
}

describe("FormulaDrawLandingChart", () => {
  it("exposes a concise non-interactive chart summary alongside keyboard-operable point controls", async () => {
    const chart = await renderChart(records);

    const svg = chart.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelector('[role="button"]')).toBeNull();
    expect(chart.querySelectorAll<HTMLButtonElement>('button[data-landing-issue]')).toHaveLength(3);
    expect(svg?.getAttribute("aria-label")).toContain("实际开奖落点组合图");
    expect(svg?.getAttribute("aria-label")).toContain("3个已开奖期");

    const point = chart.querySelector<HTMLButtonElement>('[data-landing-issue="101"]');
    expect(point).not.toBeNull();
    if (!point) throw new Error("Expected first landing chart point");
    const focusHalo = point.querySelector<HTMLElement>(".rq-formula-landing-chart__focus-halo");
    expect(Number.parseFloat(getComputedStyle(point).width)).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(getComputedStyle(point).height)).toBeGreaterThanOrEqual(44);
    expect(focusHalo).not.toBeNull();

    await act(async () => point.focus());
    expect(point.classList.contains("is-keyboard-focused")).toBe(true);
  });

  it("band-centers edge bars and flips the final direct label into the plot", async () => {
    const chart = await renderChart(records);
    const bars = chart.querySelectorAll<SVGRectElement>(".rq-formula-landing-chart__bar");
    const labels = chart.querySelectorAll<SVGTextElement>(".rq-formula-landing-chart__direct-label");

    expect(bars[0].getAttribute("x")).toBe("74");
    expect(bars[2].getAttribute("x")).toBe("622");
    expect(labels[0].getAttribute("x")).toBe("108");
    expect(labels[0].getAttribute("text-anchor")).toBe("start");
    expect(labels[2].getAttribute("x")).toBe("636");
    expect(labels[2].getAttribute("text-anchor")).toBe("end");
  });

  it("labels the x-axis and visible ticks with target draw issues rather than calculation issues", async () => {
    const chart = await renderChart(records);
    const ticks = [...chart.querySelectorAll<SVGTextElement>(".rq-formula-landing-chart__axis-label.is-target-issue")];

    expect(chart.textContent).toContain("开奖期");
    expect(ticks.map((tick) => tick.textContent)).toEqual(["102", "103", "104"]);
    expect(ticks.map((tick) => tick.textContent)).not.toContain("101");
  });

  it("bounds a 49-rank axis while retaining its first and last ranks", async () => {
    const chart = await renderChart([
      records[0],
      { ...records[1], rank: 49, rankLabel: "第 49 位" },
    ]);
    const rankTicks = [...chart.querySelectorAll<SVGTextElement>(".rq-formula-landing-chart__axis-label.is-rank")];

    expect(rankTicks).toHaveLength(5);
    expect(rankTicks.map((tick) => tick.textContent)).toEqual(["#1", "#13", "#25", "#37", "#49"]);
  });

  it("renders truthful count and rank geometry with direct, accessible labels", async () => {
    const onFocusIssue = vi.fn();
    const chart = await renderChart(records, { focusedIssue: "102", onFocusIssue });

    const svg = chart.querySelector('svg[aria-label*="第1位在上"]');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 760 300");
    expect(svg?.getAttribute("aria-label")).toContain("102期，实际龙，特码14，被排除次数2，第 1 位");
    expect(svg?.getAttribute("aria-label")).toContain("104期，实际虎，特码28，被排除次数3，并列第 2 位");
    expect(chart.querySelectorAll(".rq-formula-landing-chart__bar")).toHaveLength(3);
    expect(chart.querySelectorAll(".rq-formula-landing-chart__rank-line")).toHaveLength(1);
    expect(chart.querySelector(".rq-formula-landing-chart__average-line")).not.toBeNull();
    expect(chart.textContent).toContain("次数");
    expect(chart.textContent).toContain("当期位置 · 第1位在上");
    expect(chart.textContent).toContain("龙 · 14");

    const barHeights = [...chart.querySelectorAll<SVGRectElement>(".rq-formula-landing-chart__bar")]
      .map((bar) => Number(bar.getAttribute("height")));
    expect(barHeights[2]).toBeGreaterThan(barHeights[0]);
    expect(barHeights[0]).toBeGreaterThan(barHeights[1]);

    const rankYs = [...chart.querySelectorAll<SVGCircleElement>(".rq-formula-landing-chart__rank-dot")]
      .map((dot) => Number(dot.getAttribute("cy")));
    expect(rankYs[0]).toBeLessThan(rankYs[2]);
    expect(rankYs[2]).toBeLessThan(rankYs[1]);

    const focusedPoint = chart.querySelector<HTMLButtonElement>('[data-landing-issue="102"]');
    expect(focusedPoint?.classList.contains("is-focused")).toBe(true);
    expect(focusedPoint?.getAttribute("aria-pressed")).toBe("true");
    expect(focusedPoint?.getAttribute("aria-label")).toBe("103期，实际兔，特码21，被排除次数1，第 3 位");

    const point = chart.querySelector<HTMLButtonElement>('[data-landing-issue="101"]')!;
    await act(async () => point.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onFocusIssue).toHaveBeenCalledWith("101");
    await act(async () => point.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onFocusIssue).toHaveBeenCalledTimes(2);
    await act(async () => point.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(onFocusIssue).toHaveBeenCalledTimes(3);
  });

  it("passes the complete actual landing record to an atomic drill-down callback", async () => {
    const onFocusRecord = vi.fn();
    const chart = await renderChart(records, { onFocusRecord });
    const point = chart.querySelector<HTMLButtonElement>('[data-landing-issue="102"]');
    expect(point).not.toBeNull();
    if (!point) throw new Error("Expected second landing chart point");

    await act(async () => point.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => point.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(onFocusRecord).toHaveBeenCalledTimes(2);
    expect(onFocusRecord).toHaveBeenLastCalledWith(records[1]);
  });

  it("opens the chart in a readable full-screen dialog and closes with Escape", async () => {
    const chart = await renderChart(records);
    const expand = [...chart.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("放大图表"));
    expect(expand).toBeDefined();
    await act(async () => expand?.click());

    const dialog = document.body.querySelector('[role="dialog"][aria-label="放大实际落点图"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelectorAll("[data-landing-issue]")).toHaveLength(3);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.body.querySelector('[role="dialog"][aria-label="放大实际落点图"]')).toBeNull();
  });

  it("omits an average reference for a single record and pads the special number", async () => {
    const chart = await renderChart([{ ...records[0], specialNumber: 7 }]);

    expect(chart.querySelector(".rq-formula-landing-chart__average-line")).toBeNull();
    expect(chart.textContent).toContain("龙 · 07");
  });

  it("renders a neutral empty state without a fabricated chart", async () => {
    const chart = await renderChart([]);

    expect(chart.textContent).toContain("当前暂无已开奖期可验证实际结果");
    expect(chart.querySelector("svg")).toBeNull();
  });
});
