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

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function findButton(label: string): HTMLButtonElement {
  const button = [...(host?.querySelectorAll("button") ?? [])]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`没有找到按钮：${label}`);
  return button as HTMLButtonElement;
}

async function renderView() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(React.createElement(FormulaResultStatisticsView, {
      draws,
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
});
