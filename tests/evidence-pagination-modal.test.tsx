// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { FormulaEvidenceWorkspace } from "@/components/formula-analysis/formula-evidence-workspace";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";
import { buildFormulaAnalysisReport } from "@/lib/formula-analysis/build-analysis-report";
import { seedDraws, seedRules } from "@/lib/data/seed";
import { defaultConfig } from "@/lib/config/default-config";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); });
async function render(element: React.ReactElement) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(element)); return host; }
async function click(element: Element) { await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function input(element: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }

it("searches all 95 records, loads every match, resets paging and selected details", async () => {
  const report = buildFormulaAnalysisReport({ draws: seedDraws.slice(-20), rules: seedRules.filter(r => r.enabled).slice(0, 8), config: defaultConfig, window: 10, action: "exclude", targetType: "zodiac", source: { label: "测试数据", updatedAt: "2026-09-05T00:00:00Z" } });
  const template = report.summary.periods.flatMap(p => p.contributions).find(c => c.action === "exclude" && c.targetType === "zodiac")!;
  expect(template).toBeDefined();
  const records = Array.from({ length: 95 }, (_, i) => ({ ...template, id: `test-${i}`, ruleName: i >= 90 ? `末尾公式${i}` : `公式${i}` }));
  const data = { ...report, landing: { ...report.landing, domain: [...report.landing.domain].sort((a, b) => Number(b.target === template.targets[0]) - Number(a.target === template.targets[0])) }, summary: { ...report.summary, periods: [{ ...report.summary.periods[0], contributions: records }] } };
  const view = await render(<FormulaEvidenceWorkspace report={data} initialIssue="" />);
  expect(view.querySelector(".rq-evidence-workspace__focus")?.textContent).toContain("全部计算期");
  expect(view.querySelectorAll("[data-evidence-row]")).toHaveLength(40);
  await click(view.querySelector(".rq-evidence-load-more")!);
  expect(view.querySelectorAll("[data-evidence-row]")).toHaveLength(80);
  await click(view.querySelector(".rq-evidence-load-more")!);
  expect(view.querySelectorAll("[data-evidence-row]")).toHaveLength(95);
  expect(view.querySelector(".rq-evidence-load-more")).toBeNull();
  await click(view.querySelector('[data-evidence-row="test-94"]')!);
  expect(view.querySelector("[data-evidence-detail]")).not.toBeNull();
  const search = view.querySelector<HTMLInputElement>('input[aria-label="搜索贡献公式"]')!;
  await input(search, "末尾");
  expect(view.querySelectorAll("[data-evidence-row]")).toHaveLength(5);
  expect(view.textContent).toContain("5 条符合筛选");
  expect(view.querySelector("[data-evidence-detail]")).toBeNull();
  await input(search, "不存在");
  expect(view.textContent).toContain("没有找到匹配的公式");
  await input(search, "");
  expect(view.querySelectorAll("[data-evidence-row]")).toHaveLength(40);
  await click(view.querySelector('[data-evidence-row="test-0"]')!);
  await act(async () => root.render(<FormulaEvidenceWorkspace report={{ ...data }} />));
  expect(view.querySelector("[data-evidence-detail]")).toBeNull();
  expect(view.querySelector('[data-evidence-row][aria-selected="true"]')).toBeNull();
});

it("traps modal focus, closes on Escape and backdrop, and restores focus and scrolling", async () => {
  const view = await render(<ExpandableVisualization title="完整记录"><button>最后一项</button></ExpandableVisualization>);
  const open = view.querySelector<HTMLButtonElement>(".rq-expandable-visualization__open")!;
  open.focus(); await click(open);
  const dialog = document.querySelector('[role="dialog"]')!;
  const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭放大图表"]')!;
  expect(document.activeElement).toBe(close);
  expect(document.documentElement.style.overflow).toBe("hidden");
  const last = dialog.querySelectorAll("button")[1]; last.focus();
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
  expect(document.activeElement).toBe(close);
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(open);
  expect(document.documentElement.style.overflow).toBe("");
  await click(open); await click(document.querySelector(".rq-visualization-dialog__backdrop")!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(open);
});
