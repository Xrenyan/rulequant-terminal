// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";
import { FormulaCompleteMatrix } from "@/components/formula-complete-matrix";
import { buildFormulaAnalysisReport } from "@/lib/formula-analysis/build-analysis-report";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let resizeCallbacks: Map<Element, ResizeObserverCallback>;
beforeEach(() => {
  frames = new Map();
  resizeCallbacks = new Map();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) { resizeCallbacks.set(element, this.callback); }
    disconnect() { for (const [element, callback] of resizeCallbacks) if (callback === this.callback) resizeCallbacks.delete(element); }
  });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function flushFrame() {
  await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0)); });
}
async function click(element: Element) { await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }

const base = buildFormulaAnalysisReport({ draws: seedDraws.slice(-12), rules: seedRules.slice(0, 2), config: defaultConfig, window: 10, action: "exclude", targetType: "number", source: { label: "test" } }).landing;
const periods = Array.from({ length: 201 }, (_, index) => ({ ...base.matrixPeriods[0], calculationIssue: String(2026067 + index), targetIssue: String(2026068 + index), isPending: index === 200 }));
const analysis = { ...base, matrixPeriods: periods, records: [], series: base.series.map((series) => ({ ...series, values: periods.map((_, index) => index) })), globalMax: 200 };
function Matrix() {
  const [focusedIssue, setFocusedIssue] = useState("all");
  return <FormulaCompleteMatrix analysis={analysis} targetType="number" selectedTargetKey="number:49" focusedIssue={focusedIssue} onSelectTarget={() => {}} onFocusIssue={setFocusedIssue} />;
}
async function render(node: React.ReactNode) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(node));
  return host.querySelector<HTMLDivElement>("[data-matrix-viewport]")!;
}
function expectVisibleRows(viewport: HTMLElement) {
  const rows = [...viewport.querySelectorAll<HTMLElement>("[data-matrix-period]")];
  expect(rows.some((row) => Number.parseFloat(row.style.top) < viewport.scrollTop + viewport.clientHeight && Number.parseFloat(row.style.top) + Number.parseFloat(row.style.height) > viewport.scrollTop)).toBe(true);
}

it("copies the current visualization color on each open and releases it on close to inherit later mode changes", async () => {
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = computedStyle(element);
    const read = style.getPropertyValue.bind(style);
    // jsdom does not resolve inherited custom properties; simulate the browser's
    // computed value while retaining real DOM scope changes during the move.
    style.getPropertyValue = (property: string) => {
      if (property !== "--rq-viz-mark") return read(property);
      for (let scope: Element | null = element; scope; scope = scope.parentElement) {
        const value = (scope as HTMLElement).style?.getPropertyValue(property);
        if (value) return value;
      }
      return "";
    };
    return style;
  });
  await render(<div data-viz-scope style={{ "--rq-viz-mark": "#cf4d64" } as React.CSSProperties}><ExpandableVisualization title="颜色继承"><div data-colored-chart /></ExpandableVisualization></div>);
  const scope = host.querySelector<HTMLElement>("[data-viz-scope]")!;
  const open = host.querySelector(".rq-expandable-visualization__open")!;
  await click(open);
  const portalHost = document.querySelector<HTMLElement>(".rq-visualization-dialog")!.parentElement!;
  expect(portalHost.style.getPropertyValue("--rq-viz-mark")).toBe("#cf4d64");
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  expect(portalHost.style.getPropertyValue("--rq-viz-mark")).toBe("");
  scope.style.setProperty("--rq-viz-mark", "#3f68d8");
  await click(open);
  expect(portalHost.style.getPropertyValue("--rq-viz-mark")).toBe("#3f68d8");
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  expect(portalHost.style.getPropertyValue("--rq-viz-mark")).toBe("");
  scope.style.removeProperty("--rq-viz-mark");
  await click(open);
  expect(portalHost.style.getPropertyValue("--rq-viz-mark")).toBe("");
  expect(document.querySelectorAll("[data-colored-chart]")).toHaveLength(1);
});

it("keeps real nested scroll offsets and visible final matrix rows through open and close despite browser reparent resets", async () => {
  const append = Node.prototype.appendChild;
  vi.spyOn(Node.prototype, "appendChild").mockImplementation(function<T extends Node>(this: Node, node: T): T {
    const result = append.call(this, node) as T;
    if (node instanceof HTMLElement && node.querySelector("[data-matrix-viewport]")) {
      // Browser reparenting can reset native offsets without a scroll event.
      node.querySelectorAll<HTMLElement>("*").forEach((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
    }
    return result;
  });
  const viewport = await render(<ExpandableVisualization title="完整号码矩阵"><div data-nested-scroll><Matrix /></div></ExpandableVisualization>);
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 560 });
  let nativeScrollTop = 0;
  Object.defineProperty(viewport, "scrollTop", { configurable: true, get: () => nativeScrollTop, set: (value: number) => { nativeScrollTop = Math.max(0, Math.min(value, periods.length * 448 - 560)); } });
  const jump = host.querySelector<HTMLSelectElement>('[aria-label="跳转矩阵计算期"]')!;
  await act(async () => { jump.value = "2026267"; jump.dispatchEvent(new Event("change", { bubbles: true })); });
  await flushFrame();
  const expectedTop = viewport.scrollTop;
  expect(expectedTop).toBeGreaterThan(88000);
  const nested = host.querySelector<HTMLElement>("[data-nested-scroll]")!;
  nested.scrollTop = 91; nested.scrollLeft = 137;
  await click(host.querySelector(".rq-expandable-visualization__open")!);
  expect(document.querySelector('[role="dialog"] [data-matrix-viewport]')).toBe(viewport);
  expect(viewport.scrollTop).toBe(expectedTop);
  // A further layout pass may clear offsets after the immediate restoration.
  viewport.scrollTop = 0;
  await act(async () => resizeCallbacks.get(viewport)?.([], {} as ResizeObserver));
  await flushFrame();
  expect(viewport.scrollTop).toBe(expectedTop);
  expectVisibleRows(viewport);
  expect(nested.scrollTop).toBe(91); expect(nested.scrollLeft).toBe(137);
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  await flushFrame();
  expect(host.querySelector("[data-matrix-viewport]")).toBe(viewport);
  expect(viewport.scrollTop).toBe(expectedTop);
  expect(nested.scrollTop).toBe(91); expect(nested.scrollLeft).toBe(137);
  expectVisibleRows(viewport);
  expect(document.querySelectorAll("[data-matrix-viewport]")).toHaveLength(1);
  await click(host.querySelector(".rq-expandable-visualization__open")!);
  await flushFrame();
  await act(async () => { viewport.scrollTop = 150 * 448; viewport.dispatchEvent(new Event("scroll")); });
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await flushFrame();
  expect(viewport.scrollTop).toBe(150 * 448);
  expectVisibleRows(viewport);
});

it("resynchronizes virtual rows and viewport coverage with real scrolling after a resize", async () => {
  const viewport = await render(<Matrix />);
  let height = 560;
  Object.defineProperty(viewport, "clientHeight", { configurable: true, get: () => height });
  const jump = host.querySelector<HTMLSelectElement>('[aria-label="跳转矩阵计算期"]')!;
  await act(async () => { jump.value = "2026267"; jump.dispatchEvent(new Event("change", { bubbles: true })); });
  await flushFrame();
  // Resizing/reparenting may clamp native scrolling before a browser scroll event.
  viewport.scrollTop = 20 * 448; height = 3600;
  const notifyResize = resizeCallbacks.get(viewport);
  expect(notifyResize).toBeTypeOf("function");
  await act(async () => notifyResize?.([], {} as ResizeObserver));
  await flushFrame();
  expectVisibleRows(viewport);
  expect(viewport.querySelector('[data-matrix-period="2026087"]')).not.toBeNull();
  expect(viewport.querySelector('[data-matrix-period="2026095"]')).not.toBeNull();
  expect(viewport.querySelectorAll("[data-number-cell]").length).toBeLessThan(800);
});
