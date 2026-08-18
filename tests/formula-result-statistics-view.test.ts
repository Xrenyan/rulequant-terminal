// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaResultStatisticsView } from "@/components/formula-result-statistics-view";
import { defaultConfig } from "@/lib/config/default-config";
import { buildFormulaSummaryReport } from "@/lib/formula-summary/formula-summary";
import type { DrawRecord, RuleRecord } from "@/types/domain";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draws: DrawRecord[] = [
  { issue: "101", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "102", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
  { issue: "103", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
];

function makeRule(id: string, category: RuleRecord["category"], formula = "平1"): RuleRecord {
  return {
    id,
    name: id,
    category,
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

const rules = [
  makeRule("杀一肖一", "kill_zodiac"),
  makeRule("杀一肖二", "kill_zodiac"),
  makeRule("参考一肖", "include_zodiac"),
  makeRule("杀半头", "kill_half_head"),
  makeRule("杀半波", "kill_half_color"),
  makeRule("不统计单双", "kill_parity"),
  makeRule("不统计大小", "kill_size"),
];

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let workerDescriptor: PropertyDescriptor | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  if (workerDescriptor) Object.defineProperty(globalThis, "Worker", workerDescriptor);
  else delete (globalThis as { Worker?: typeof Worker }).Worker;
  workerDescriptor = undefined;
});

function findButton(label: string): HTMLButtonElement {
  const button = [...(host?.querySelectorAll("button") ?? [])]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`没有找到按钮：${label}`);
  return button as HTMLButtonElement;
}

async function renderView({ draws: viewDraws = draws }: { draws?: DrawRecord[] } = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await rerenderView({ draws: viewDraws });
}

function findLink(label: string): HTMLAnchorElement {
  const link = [...(host?.querySelectorAll("a") ?? [])]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!link) throw new Error(`没有找到链接：${label}`);
  return link as HTMLAnchorElement;
}

async function rerenderView({ draws: viewDraws = draws }: { draws?: DrawRecord[] } = {}) {
  await act(async () => {
    root?.render(React.createElement(FormulaResultStatisticsView, {
      draws: viewDraws,
      rules,
      config: defaultConfig,
    }));
  });
}

describe("formula result statistics view", () => {
  it("switches from the complete latest output to the complete recent-ten-period view", async () => {
    await renderView();

    expect(host?.textContent).toContain("公式结果统计");
    expect(host?.textContent).toContain("最新输出");
    expect(host?.textContent).toContain("最近十期");
    expect(host?.textContent).not.toContain("单双统计");
    expect(host?.textContent).not.toContain("大小统计");
    expect(findButton("最新输出").getAttribute("aria-pressed")).toBe("true");

    const recentButton = findButton("最近十期");
    await act(async () => recentButton.click());

    expect(recentButton.getAttribute("aria-pressed")).toBe("true");
    expect(host?.textContent).toContain("3 个计算期");
  });

  it("keeps exclusion and support counts separate when the action changes", async () => {
    await renderView();

    expect(findButton("排除统计").getAttribute("aria-pressed")).toBe("true");
    expect(host?.textContent).toContain("被排除次数");

    const includeButton = findButton("支持统计");
    await act(async () => includeButton.click());

    expect(includeButton.getAttribute("aria-pressed")).toBe("true");
    expect(host?.textContent).toContain("被支持次数");
    expect(host?.textContent).toContain("参考一肖");
  });

  it("builds the ten-period report off the main thread when Web Workers are available", async () => {
    class WorkerStub {
      static instance: WorkerStub | undefined;
      onmessage: ((event: MessageEvent<{ ok: boolean; report?: ReturnType<typeof buildFormulaSummaryReport> }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        WorkerStub.instance = this;
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: WorkerStub });
    await renderView();

    expect(WorkerStub.instance?.postMessage).toHaveBeenCalledWith({ draws, rules, config: defaultConfig, maxPeriods: 11 });
    expect(host?.textContent).toContain("正在整理完整统计");

    const report = buildFormulaSummaryReport({ draws, rules, config: defaultConfig, maxPeriods: 11 });
    await act(async () => WorkerStub.instance?.onmessage?.({ data: { ok: true, report } } as MessageEvent));

    expect(host?.textContent).toContain("最新输出");
    await act(async () => findButton("最近十期").click());
    expect(host?.textContent).toContain("3 个计算期");
  });

  it("opens the route-based analysis cockpit with the current action and type", async () => {
    await renderView();

    const link = findLink("进入公式结果分析");
    expect(link.getAttribute("href")).toContain("/formula-result-statistics/analysis?");
    expect(link.getAttribute("href")).toContain("action=exclude");
    expect(link.getAttribute("href")).not.toContain("parity");
    expect(link.getAttribute("href")).not.toContain("size");
  });

  it("falls back to the synchronous report when the summary worker fails", async () => {
    class FailingWorkerStub {
      static instance: FailingWorkerStub | undefined;
      onmessage: ((event: MessageEvent<{ ok: boolean; report?: ReturnType<typeof buildFormulaSummaryReport> }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        FailingWorkerStub.instance = this;
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: FailingWorkerStub });
    await renderView({ draws: [...draws] });

    await act(async () => FailingWorkerStub.instance?.onerror?.(new ErrorEvent("error")));

    expect(host?.textContent).toContain("最新输出");
    expect(host?.textContent).not.toContain("正在整理完整统计");
  });

  it("falls back when the worker reports an unsuccessful payload", async () => {
    class UnsuccessfulWorkerStub {
      static instance: UnsuccessfulWorkerStub | undefined;
      onmessage: ((event: MessageEvent<{ ok: boolean; error?: string }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        UnsuccessfulWorkerStub.instance = this;
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: UnsuccessfulWorkerStub });
    await renderView({ draws: [...draws] });

    await act(async () => UnsuccessfulWorkerStub.instance?.onmessage?.({ data: { ok: false, error: "worker summary failed" } } as MessageEvent));

    expect(host?.textContent).toContain("最新输出");
    expect(UnsuccessfulWorkerStub.instance?.terminate).toHaveBeenCalledTimes(1);
  });

  it("falls back when Worker construction throws", async () => {
    class ConstructorThrowingWorker {
      constructor() {
        throw new Error("Worker construction failed");
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: ConstructorThrowingWorker });
    await renderView({ draws: [...draws] });

    expect(host?.textContent).toContain("最新输出");
    expect(host?.textContent).not.toContain("正在整理完整统计");
  });

  it("falls back when the Worker cannot clone the input message", async () => {
    class PostMessageThrowingWorker {
      static instance: PostMessageThrowingWorker | undefined;
      onmessage: ((event: MessageEvent<{ ok: boolean }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn(() => {
        throw new DOMException("Cannot clone request", "DataCloneError");
      });
      terminate = vi.fn();

      constructor() {
        PostMessageThrowingWorker.instance = this;
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: PostMessageThrowingWorker });
    await renderView({ draws: [...draws] });

    expect(host?.textContent).toContain("最新输出");
    expect(PostMessageThrowingWorker.instance?.terminate).toHaveBeenCalledTimes(1);
  });

  it("falls back when the Worker emits a messageerror event", async () => {
    class MessageErrorWorkerStub {
      static instance: MessageErrorWorkerStub | undefined;
      onmessage: ((event: MessageEvent<{ ok: boolean }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        MessageErrorWorkerStub.instance = this;
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: MessageErrorWorkerStub });
    await renderView({ draws: [...draws] });

    await act(async () => MessageErrorWorkerStub.instance?.onmessageerror?.(new MessageEvent("messageerror")));

    expect(host?.textContent).toContain("最新输出");
    expect(MessageErrorWorkerStub.instance?.terminate).toHaveBeenCalledTimes(1);
  });

  it("settles once and ignores late Worker events after recovery or unmount", async () => {
    class LateEventWorkerStub {
      static instance: LateEventWorkerStub | undefined;
      onmessage: ((event: MessageEvent<{ ok: boolean; report?: ReturnType<typeof buildFormulaSummaryReport> }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        LateEventWorkerStub.instance = this;
      }
    }

    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: LateEventWorkerStub });
    await renderView({ draws: [...draws] });

    const instance = LateEventWorkerStub.instance;
    await act(async () => instance?.onerror?.(new ErrorEvent("error")));
    expect(host?.textContent).toContain("最新输出");
    expect(instance?.terminate).toHaveBeenCalledTimes(1);

    const lateReport = { ...buildFormulaSummaryReport({ draws, rules, config: defaultConfig, maxPeriods: 11 }), formulaCount: 999 };
    await act(async () => instance?.onmessage?.({ data: { ok: true, report: lateReport } } as MessageEvent));
    await act(async () => instance?.onmessageerror?.(new MessageEvent("messageerror")));

    expect(host?.textContent).not.toContain("999 条");
    expect(instance?.terminate).toHaveBeenCalledTimes(1);

    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => instance?.onerror?.(new ErrorEvent("error")));
    expect(instance?.terminate).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending Worker response from stale draw props after a rerender", async () => {
    class PropSwapWorkerStub {
      static instances: PropSwapWorkerStub[] = [];
      onmessage: ((event: MessageEvent<{ ok: boolean; report?: ReturnType<typeof buildFormulaSummaryReport> }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        PropSwapWorkerStub.instances.push(this);
      }
    }

    const oldDraws = [...draws];
    const nextDraws: DrawRecord[] = [
      { issue: "201", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
      { issue: "202", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
      { issue: "203", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
    ];
    workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
    Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: PropSwapWorkerStub });
    await renderView({ draws: oldDraws });
    const oldWorker = PropSwapWorkerStub.instances[0];

    await rerenderView({ draws: nextDraws });
    const currentWorker = PropSwapWorkerStub.instances[1];
    const staleReport = { ...buildFormulaSummaryReport({ draws: oldDraws, rules, config: defaultConfig, maxPeriods: 11 }), formulaCount: 999 };
    await act(async () => oldWorker.onmessage?.({ data: { ok: true, report: staleReport } } as MessageEvent));

    expect(oldWorker.terminate).toHaveBeenCalledTimes(1);
    expect(host?.textContent).not.toContain("999 条");

    const nextReport = buildFormulaSummaryReport({ draws: nextDraws, rules, config: defaultConfig, maxPeriods: 11 });
    await act(async () => currentWorker.onmessage?.({ data: { ok: true, report: nextReport } } as MessageEvent));

    expect(host?.textContent).toContain("203");
    expect(host?.textContent).not.toContain("999 条");
  });

  it("keeps the page recent range at ten calculation periods", async () => {
    const longDraws = Array.from({ length: 12 }, (_, index) => ({
      issue: String(101 + index),
      n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6,
      special: index % 49 + 1,
    }));
    await renderView({ draws: longDraws });
    await act(async () => findButton("最近十期").click());
    expect(host?.textContent).toContain("10 个计算期");
  });
});
