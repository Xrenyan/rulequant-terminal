// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";
import { FormulaAnalysisCockpit } from "@/components/formula-analysis/formula-analysis-cockpit";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/formula-analysis/formula-analysis-worker-client", () => ({ startFormulaAnalysisReportRequest: () => () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let reducedMotion = false;
let runs: Array<{ finish: () => void; cancel: ReturnType<typeof vi.fn>; frames: Keyframe[]; options: KeyframeAnimationOptions }>;
const nativeAnimate = Element.prototype.animate;
beforeEach(() => {
  reducedMotion = false; runs = [];
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reducedMotion })));
  Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => {
    let finish!: () => void; let reject!: () => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = () => fail(new Error("cancelled")); });
    const cancel = vi.fn(reject);
    runs.push({ finish, cancel, frames, options });
    return { finished, cancel } as unknown as Animation;
  }) });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  if (nativeAnimate) Element.prototype.animate = nativeAnimate;
  else Reflect.deleteProperty(Element.prototype, "animate");
  vi.useRealTimers();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(node));
  return host;
}
async function click(element: Element) { await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }

it("animates one chart instance, allows interruption, and exits only on its own bounded motion", async () => {
  await render(<ExpandableVisualization title="动效"><input aria-label="保留状态" defaultValue="已选49" /></ExpandableVisualization>);
  const open = host.querySelector<HTMLButtonElement>(".rq-expandable-visualization__open")!;
  const content = host.querySelector('[aria-label="保留状态"]')!;
  await click(open);
  expect(runs).toHaveLength(2);
  expect(runs.every((run) => run.options.duration === 180 || run.options.duration === 160)).toBe(true);
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  expect(runs[0].cancel).toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  const interruptedExit = runs.slice(2);
  await click(open); // re-open during exit must cancel its completion
  await act(async () => interruptedExit.forEach((run) => run.finish()));
  expect(document.querySelector('[role="dialog"] [aria-label="保留状态"]')).toBe(content);
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  await act(async () => runs.slice(-2).forEach((run) => run.finish()));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[aria-label="保留状态"]')).toBe(content);
  expect(document.querySelectorAll('[aria-label="保留状态"]')).toHaveLength(1);
  expect(document.activeElement).toBe(open);
});

it("uses immediate transitions when reduced motion is requested", async () => {
  reducedMotion = true;
  await render(<ExpandableVisualization title="少动效"><div>内容</div></ExpandableVisualization>);
  await click(host.querySelector(".rq-expandable-visualization__open")!);
  expect(runs).toHaveLength(0);
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(runs).toHaveLength(0);
});

it("still closes if the browser never resolves an exit animation", async () => {
  vi.useFakeTimers();
  await render(<ExpandableVisualization title="有界退出"><div>内容</div></ExpandableVisualization>);
  await click(host.querySelector(".rq-expandable-visualization__open")!);
  await click(document.querySelector('[aria-label="关闭放大图表"]')!);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(201));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps mobile filters keyboard-contained, closes only the nested select first, and returns focus", async () => {
  reducedMotion = true;
  await render(<FormulaAnalysisCockpit draws={seedDraws} rules={seedRules} config={defaultConfig} dataSourceLabel="测试" />);
  const trigger = host.querySelector<HTMLButtonElement>(".rq-analysis-toolbar__mobile-trigger")!;
  trigger.focus(); await click(trigger);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="分析筛选"]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[aria-label="关闭分析筛选"]')!;
  close.focus();
  await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
  expect(document.activeElement?.textContent).toContain("保存视图");
  const select = dialog.querySelector<HTMLButtonElement>('[aria-label="结果类型"]')!;
  await click(select);
  const option = document.querySelector<HTMLButtonElement>('[role="listbox"] [role="option"]')!;
  const lastOption = [...document.querySelectorAll<HTMLButtonElement>('[role="listbox"] [role="option"]')].at(-1)!;
  lastOption.focus();
  await act(async () => lastOption.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
  expect(document.activeElement).toBe(close);
  option.focus();
  await act(async () => option.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.querySelector('[role="dialog"][aria-label="分析筛选"]')).toBe(dialog);
  expect(document.activeElement).toBe(select);
  await act(async () => close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="dialog"][aria-label="分析筛选"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("makes analysis tabs respond to arrow and boundary keys without altering filters", async () => {
  vi.useFakeTimers();
  await render(<FormulaAnalysisCockpit draws={seedDraws} rules={seedRules} config={defaultConfig} dataSourceLabel="测试" />);
  await act(async () => vi.advanceTimersByTime(1));
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
  tabs[0].focus();
  await act(async () => tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  // The router mock deliberately returns a fresh object on each render. An
  // unchanged URL value must not schedule a stale route reset over this click.
  await act(async () => vi.advanceTimersByTime(1));
  expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[1]);
  await act(async () => tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(tabs[3].getAttribute("aria-selected")).toBe("true");
  expect(host.querySelector('[aria-label="分析期数"]')?.textContent).toContain("最近10期");
});
