// @vitest-environment jsdom
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";
import { FormulaCompleteMatrix } from "@/components/formula-complete-matrix";
import { FormulaDrawLandingChart } from "@/components/formula-draw-landing-chart";
import { FormulaHealthWorkspace } from "@/components/formula-analysis/formula-health-workspace";
import { buildFormulaAnalysisReport } from "@/lib/formula-analysis/build-analysis-report";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); });
async function render(node: React.ReactNode) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(node)); return host; }
async function click(node: Element) { await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
const report = () => buildFormulaAnalysisReport({ draws: seedDraws.slice(-12), rules: seedRules.slice(0, 2), config: defaultConfig, window: 10, action: "exclude", targetType: "number", source: { label: "test" } });

it("moves one mounted visualization into fullscreen, retaining local state and the same DOM node", async () => {
  const mounts = vi.fn();
  function Stateful() { const [count, setCount] = useState(0); useEffect(() => { mounts(); }, []); return <button data-stateful onClick={() => setCount(count + 1)}>已选{count}</button>; }
  const view = await render(<ExpandableVisualization title="状态保持"><Stateful /></ExpandableVisualization>);
  const content = view.querySelector("[data-stateful]")!;
  await click(content);
  const open = view.querySelector(".rq-expandable-visualization__open")!;
  await click(open);
  expect(document.querySelectorAll("[data-stateful]")).toHaveLength(1);
  expect(document.querySelector('[role="dialog"] [data-stateful]')).toBe(content);
  expect(content.textContent).toBe("已选1");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(view.querySelector("[data-stateful]")).toBe(content);
  expect(mounts).toHaveBeenCalledTimes(1);
});

it("bounds 200-period number-matrix DOM and can jump directly to the final period without changing counts", async () => {
  const base = report().landing;
  const periods = Array.from({ length: 201 }, (_, index) => ({ ...base.matrixPeriods[0], calculationIssue: String(1000 + index), isPending: index === 200 }));
  const analysis = { ...base, matrixPeriods: periods, records: [], series: base.series.map((series) => ({ ...series, values: periods.map((_, index) => index) })), globalMax: 200 };
  const onFocusIssue = vi.fn();
  const view = await render(<FormulaCompleteMatrix analysis={analysis} targetType="number" selectedTargetKey="number:49" focusedIssue="all" onSelectTarget={vi.fn()} onFocusIssue={onFocusIssue} />);
  expect(view.querySelectorAll("[data-number-cell]").length).toBeLessThan(500);
  const jump = view.querySelector<HTMLSelectElement>('[aria-label="跳转矩阵计算期"]')!;
  expect(jump.options).toHaveLength(202);
  await act(async () => { jump.value = "1200"; jump.dispatchEvent(new Event("change", { bubbles: true })); });
  const last = view.querySelector('[data-matrix-period="1200"]')!;
  expect(last).not.toBeNull();
  expect(last.querySelectorAll("[data-number-cell]")).toHaveLength(49);
  expect(last.querySelector('[data-number-cell="49"] strong')?.textContent).toBe("200");
  expect(onFocusIssue).toHaveBeenCalledWith("1200");
  const search = view.querySelector<HTMLInputElement>('[aria-label="搜索矩阵期次"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "1101"); search.dispatchEvent(new Event("input", { bubbles: true })); });
  const matched = view.querySelector('[data-matrix-period="1101"]')!;
  expect(matched.querySelector('[data-number-cell="49"] strong')?.textContent).toBe("101");
  expect(view.querySelectorAll("[data-number-cell]").length).toBeLessThanOrEqual(98);
});

it("gives all 200 trend points distinct touch targets while keeping visible labels sparse", async () => {
  const template = report().landing.records[0];
  const records = Array.from({ length: 200 }, (_, index) => ({ ...template, calculationIssue: String(1000 + index), targetIssue: String(1001 + index), count: index % 5, rank: index % 49 + 1 }));
  const view = await render(<FormulaDrawLandingChart records={records} focusedIssue="all" unitLabel="被排除次数" onFocusIssue={vi.fn()} />);
  expect(view.querySelectorAll("[data-landing-issue]")).toHaveLength(200);
  const svg = view.querySelector('svg[data-chart-layout]')!;
  expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeGreaterThanOrEqual(56 * 199);
  expect(view.querySelectorAll(".is-target-issue").length).toBeLessThanOrEqual(42);
  expect(view.querySelectorAll(".rq-formula-landing-chart__direct-label").length).toBeLessThanOrEqual(42);
  expect(view.querySelector('[data-landing-issue="1199"]')?.getAttribute("aria-label")).toContain("1200期");
});

it("pages all health rows and mounts a formula's effect only after its disclosure opens", async () => {
  const base = report();
  const data = { ...base, health: { ...base.health, rows: Array.from({ length: 258 }, (_, index) => ({ ...base.health.rows[0], ruleId: `rule-${index}`, ruleName: `公式${String(index).padStart(3, "0")}` })) } };
  const view = await render(<FormulaHealthWorkspace report={data} onOpenIssue={vi.fn()} />);
  expect(view.querySelectorAll("[data-health-row]")).toHaveLength(20);
  expect(view.querySelectorAll(".rq-formula-effect")).toHaveLength(0);
  const details = view.querySelector<HTMLDetailsElement>("[data-effect-disclosure]")!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
  expect(view.querySelectorAll(".rq-formula-effect")).toHaveLength(1);
  await click(view.querySelector('[aria-label="下一页公式健康记录"]')!);
  expect(view.querySelector('[data-health-row="rule-20"]')).not.toBeNull();
  expect(view.querySelectorAll(".rq-formula-effect")).toHaveLength(0);
  const search = view.querySelector<HTMLInputElement>('[aria-label="搜索公式"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "公式257"); search.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(view.querySelectorAll("[data-health-row]")).toHaveLength(1);
  expect(view.querySelector('[data-health-row="rule-257"]')).not.toBeNull();
});
