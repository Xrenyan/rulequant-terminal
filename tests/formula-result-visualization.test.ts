// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FormulaResultStatisticsView } from "@/components/formula-result-statistics-view";
import { defaultConfig } from "@/lib/config/default-config";
import type { DrawRecord, RuleRecord } from "@/types/domain";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draws: DrawRecord[] = [
  { issue: "101", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "102", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 14 },
  { issue: "103", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 21 },
  { issue: "104", n1: 22, n2: 23, n3: 24, n4: 25, n5: 26, n6: 27, special: 28 },
];

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

async function renderView() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(React.createElement(FormulaResultStatisticsView, {
      draws,
      rules: [makeRule("杀肖甲", "平1"), makeRule("杀肖乙", "平2"), makeRule("杀肖丙", "平3")],
      config: defaultConfig,
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
    expect(dialog?.textContent).toContain("结果构成");
    expect(dialog?.textContent).toContain("公式贡献排行");
    expect(dialog?.textContent).toContain("最近十期变化");
    expect(dialog?.textContent).toContain("公式贡献结构");
    expect(dialog?.textContent).toContain("贡献公式明细");
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
