// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaCompleteMatrix } from "@/components/formula-complete-matrix";
import { defaultConfig } from "@/lib/config/default-config";
import { buildFormulaDrawLandingAnalysis } from "@/lib/formula-summary/formula-draw-landing";
import type {
  FormulaSummaryContribution,
  FormulaSummaryPeriod,
  FormulaSummaryTarget,
  FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function contribution(
  calculationIssue: string,
  ruleId: string,
  targets: FormulaSummaryTarget[],
  targetType: FormulaSummaryTargetType = "zodiac",
): FormulaSummaryContribution {
  return {
    id: `${calculationIssue}:${ruleId}`,
    calculationIssue,
    targetIssue: String(Number(calculationIssue) + 1),
    targetLabel: String(Number(calculationIssue) + 1),
    isPending: false,
    ruleId,
    ruleName: `规则 ${ruleId}`,
    category: targetType === "number" ? "custom_set" : "kill_zodiac",
    formula: "平1 + 平2",
    expression: "01 + 02",
    action: targetType === "number" ? "include" : "exclude",
    targetType,
    targets,
    process: ["测试计算过程"],
  };
}

function completedPeriod(
  calculationIssue: string,
  number: number,
  zodiac: string,
  contributions: FormulaSummaryContribution[],
): FormulaSummaryPeriod {
  const targetIssue = String(Number(calculationIssue) + 1);
  return {
    calculationIssue,
    targetIssue,
    targetLabel: targetIssue,
    isPending: false,
    targetResult: {
      issue: targetIssue,
      number,
      zodiac,
      tail: number % 10,
      head: Math.floor(number / 10),
      sum: Math.floor(number / 10) + number % 10,
      segment: Math.ceil(number / 7),
      element: "水",
      color: "蓝",
      parity: number % 2 === 0 ? "双" : "单",
    },
    contributions,
    skippedRules: [],
  };
}

async function renderMatrix({
  periods,
  targetType,
  selectedTargetKey = "",
  focusedIssue = "all",
  onSelectTarget = vi.fn(),
  onFocusIssue = vi.fn(),
}: {
  periods: FormulaSummaryPeriod[];
  targetType: FormulaSummaryTargetType;
  selectedTargetKey?: string;
  focusedIssue?: string;
  onSelectTarget?: (targetKey: string) => void;
  onFocusIssue?: (issue: string) => void;
}) {
  const analysis = buildFormulaDrawLandingAnalysis({
    periods,
    action: targetType === "number" ? "include" : "exclude",
    targetType,
    config: defaultConfig,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(
    <FormulaCompleteMatrix
      analysis={analysis}
      targetType={targetType}
      selectedTargetKey={selectedTargetKey}
      focusedIssue={focusedIssue}
      onSelectTarget={onSelectTarget}
      onFocusIssue={onFocusIssue}
    />,
  ));
  return host;
}

describe("FormulaCompleteMatrix", () => {
  it("renders the complete zodiac domain and an accessible actual-draw button", async () => {
    const onSelectTarget = vi.fn();
    const onFocusIssue = vi.fn();
    const period = completedPeriod("101", 15, "龙", [
      contribution("101", "r1", ["龙", "兔"]),
      contribution("101", "r2", ["龙"]),
    ]);

    const matrix = await renderMatrix({
      periods: [period],
      targetType: "zodiac",
      selectedTargetKey: "string:龙",
      focusedIssue: "101",
      onSelectTarget,
      onFocusIssue,
    });

    expect(matrix.querySelectorAll("[data-matrix-target]")).toHaveLength(12);
    expect(matrix.querySelectorAll("[data-matrix-cell]")).toHaveLength(12);
    expect(matrix.textContent).toContain("马");
    expect(matrix.textContent).toContain("羊");

    const actual = matrix.querySelector<HTMLButtonElement>('[data-actual-landing="true"]')!;
    expect(actual).not.toBeNull();
    expect(actual.type).toBe("button");
    expect(actual.querySelector("svg.lucide-target")).not.toBeNull();
    expect(actual.textContent).toContain("15");
    expect(actual.textContent).toContain("2");
    expect(actual.classList.contains("is-actual")).toBe(true);
    expect(actual.classList.contains("is-selected")).toBe(true);
    expect(actual.classList.contains("is-focused")).toBe(true);
    expect(actual.style.getPropertyValue("--rq-cell-strength")).toBe("100%");

    const ariaLabel = actual.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toContain("101");
    expect(ariaLabel).toContain("102");
    expect(ariaLabel).toContain("特码15");
    expect(ariaLabel).toContain("实际开奖龙");
    expect(ariaLabel).toContain("2次");
    expect(ariaLabel).toContain("当期位置");
    expect(ariaLabel).toContain("第 1 位");

    await act(async () => actual.click());
    expect(onSelectTarget).toHaveBeenCalledWith("string:龙");
    expect(onFocusIssue).toHaveBeenCalledWith("101");

    const zeroCell = matrix.querySelector<HTMLButtonElement>('[data-matrix-cell="string:马"]')!;
    expect(zeroCell.textContent).toBe("0");
    expect(zeroCell.style.getPropertyValue("--rq-cell-strength")).toBe("0%");
    await act(async () => zeroCell.click());
    expect(onSelectTarget).toHaveBeenLastCalledWith("string:马");
    expect(onFocusIssue).toHaveBeenLastCalledWith("101");
  });

  it("labels a pending period without fabricating an actual-draw marker", async () => {
    const pending: FormulaSummaryPeriod = {
      calculationIssue: "102",
      targetLabel: "下期待开奖",
      isPending: true,
      contributions: [],
      skippedRules: [],
    };

    const matrix = await renderMatrix({ periods: [pending], targetType: "zodiac" });

    expect(matrix.textContent).toContain("→ 待开奖");
    expect(matrix.querySelector('[data-actual-landing="true"]')).toBeNull();
    expect(matrix.querySelectorAll("[data-matrix-cell]")).toHaveLength(12);
  });

  it("renders number periods as complete seven-column blocks with cross-filterable cells", async () => {
    const onSelectTarget = vi.fn();
    const onFocusIssue = vi.fn();
    const period = completedPeriod("201", 49, "羊", [
      contribution("201", "r1", [1, 49], "number"),
      contribution("201", "r2", [49], "number"),
    ]);

    const matrix = await renderMatrix({
      periods: [period],
      targetType: "number",
      selectedTargetKey: "number:49",
      focusedIssue: "201",
      onSelectTarget,
      onFocusIssue,
    });

    expect(matrix.querySelector(".rq-formula-complete-matrix.is-number")).not.toBeNull();
    expect(matrix.querySelectorAll(".rq-formula-complete-matrix__number-grid")).toHaveLength(1);
    expect(matrix.querySelectorAll("[data-number-cell]")).toHaveLength(49);
    expect(matrix.querySelector("[data-number-cell='01']")).not.toBeNull();
    expect(matrix.querySelector("[data-number-cell='49']")).not.toBeNull();
    expect(matrix.querySelectorAll("[data-matrix-target]")).toHaveLength(0);

    const actual = matrix.querySelector<HTMLButtonElement>('[data-number-cell="49"]')!;
    expect(actual.getAttribute("data-actual-landing")).toBe("true");
    expect(actual.classList.contains("is-selected")).toBe(true);
    expect(actual.classList.contains("is-focused")).toBe(true);
    expect(actual.style.getPropertyValue("--rq-cell-strength")).toBe("100%");

    const ordinary = matrix.querySelector<HTMLButtonElement>('[data-number-cell="02"]')!;
    expect(ordinary.textContent).toContain("02");
    expect(ordinary.textContent).toContain("0");
    expect(ordinary.style.getPropertyValue("--rq-cell-strength")).toBe("0%");
    await act(async () => ordinary.click());
    expect(onSelectTarget).toHaveBeenCalledWith("number:2");
    expect(onFocusIssue).toHaveBeenCalledWith("201");
  });
});
