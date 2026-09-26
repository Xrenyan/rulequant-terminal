// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { FormulaAnalysisToolbar } from "@/components/formula-analysis/formula-analysis-toolbar";
import { FormulaEffect } from "@/components/formula-analysis/formula-effect";
import { FORMULA_ANALYSIS_DEFAULT_FILTERS } from "@/lib/formula-analysis/saved-views";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("analysis range and effect controls", () => {
  it("selects 200 and exposes every comparison window", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onChange = vi.fn();
    try {
      await act(async () => root.render(<FormulaAnalysisToolbar filters={FORMULA_ANALYSIS_DEFAULT_FILTERS} rules={[]} savedViews={[]} selectedViewId="" onChange={onChange} onSave={() => {}} onRestore={() => {}} onDelete={() => {}} onOpenMobileFilters={() => {}} />));
      const range = host.querySelector('[aria-label="分析期数"]')!;
      expect(range.textContent).toBe("最近10期");
      await act(async () => { range.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(document.querySelectorAll('[role="option"]')).toHaveLength(20);
      const last = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === "最近200期")!;
      await act(async () => { last.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(onChange).toHaveBeenCalledWith({ ...FORMULA_ANALYSIS_DEFAULT_FILTERS, window: 200 });
      await act(async () => { host.querySelector('[aria-label="对比期数"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect([...document.querySelectorAll('[role="option"]')].some((item) => item.textContent === "对比最近200期")).toBe(true);
    } finally { await act(async () => root.unmount()); }
  });
  it("opens the exact historical failure issue and shows unavailable baseline without inventing zero", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const onOpenIssue = vi.fn();
    try {
      await act(async () => root.render(<FormulaEffect effect={{ status: "unavailable", sampleCount: 2, skippedCount: 0, successes: 1, actualRate: 50, expectedRate: null, differencePoints: null, actualInterval: null, successLabel: "排除正确", interpretation: "验证目标暂不支持比较", failureIssues: ["2026001"] }} onOpenIssue={onOpenIssue} />));
      expect(host.textContent).toContain("排除正确 1 次");
      expect(host.textContent).not.toContain("同条件随机参考 0");
      await act(async () => host.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      expect(onOpenIssue).toHaveBeenCalledWith("2026001");
    } finally { await act(async () => root.unmount()); }
  });
});
