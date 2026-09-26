// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FormulaAnalysisCockpit } from "@/components/formula-analysis/formula-analysis-cockpit";
import { buildFormulaAnalysisReport, type FormulaAnalysisReportInput } from "@/lib/formula-analysis/build-analysis-report";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";

const probes = vi.hoisted(() => ({
  overview: vi.fn(), landing: vi.fn(), evidence: vi.fn(), comparison: vi.fn(),
  requests: [] as Array<{ input: FormulaAnalysisReportInput; deliver: (report: FormulaAnalysisReport) => void }>,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("range=200&type=number&compare=window&compareValue=50") }));
vi.mock("@/lib/formula-analysis/formula-analysis-worker-client", () => ({ startFormulaAnalysisReportRequest: (input: FormulaAnalysisReportInput, options: { onResult: (report: FormulaAnalysisReport) => void }) => {
  probes.requests.push({ input, deliver: options.onResult }); return () => {};
} }));
vi.mock("@/components/formula-analysis/formula-analysis-overview", () => ({ FormulaAnalysisOverview: (props: { report: FormulaAnalysisReport; onOpenEvidence: (record: FormulaDrawLandingRecord) => void }) => {
  probes.overview(props); return <button data-overview onClick={() => props.onOpenEvidence(props.report.landing.records[0])}>定位证据</button>;
} }));
vi.mock("@/components/formula-analysis/formula-landing-workspace", () => ({ FormulaLandingWorkspace: (props: { report: FormulaAnalysisReport; onSelectRecord: (record: FormulaDrawLandingRecord) => void }) => {
  probes.landing(props); return <button data-landing onClick={() => props.onSelectRecord(props.report.landing.records[0])}>实际落点</button>;
} }));
vi.mock("@/components/formula-analysis/formula-evidence-workspace", () => ({ FormulaEvidenceWorkspace: (props: { report: FormulaAnalysisReport; initialRecord?: FormulaDrawLandingRecord; initialIssue?: string }) => {
  probes.evidence(props); return <div data-evidence={props.initialIssue}>{props.report.cacheKey}</div>;
} }));
vi.mock("@/components/formula-analysis/formula-analysis-comparison", () => ({ FormulaAnalysisComparison: (props: unknown) => { probes.comparison(props); return <div data-comparison />; } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const report = buildFormulaAnalysisReport({ draws: seedDraws, rules: seedRules.slice(0, 2), config: defaultConfig, window: 200, action: "exclude", targetType: "number", source: { label: "test" } });
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); probes.requests.length = 0; [probes.overview, probes.landing, probes.evidence, probes.comparison].forEach((spy) => spy.mockClear()); });
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.useRealTimers(); });
async function click(element: Element) { await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }
async function render() {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<FormulaAnalysisCockpit draws={seedDraws} rules={seedRules} config={defaultConfig} dataSourceLabel="test" />));
  await act(async () => { probes.requests.forEach((request) => request.deliver(report)); });
  await act(async () => vi.advanceTimersByTime(1));
}

it("does not redraw the populated old workspace or comparison for mobile filters, saved views, or an urgent tab switch", async () => {
  await render();
  const initialOverview = probes.overview.mock.calls.length;
  const initialComparison = probes.comparison.mock.calls.length;
  expect(initialOverview).toBeGreaterThan(0); expect(initialComparison).toBeGreaterThan(0);
  await click(host.querySelector(".rq-analysis-toolbar__mobile-trigger")!);
  await click(document.querySelector('[role="dialog"][aria-label="分析筛选"] [aria-label="关闭分析筛选"]')!);
  await click([...host.querySelectorAll("button")].find((button) => button.textContent === "保存视图")!);
  expect(probes.overview).toHaveBeenCalledTimes(initialOverview);
  expect(probes.comparison).toHaveBeenCalledTimes(initialComparison);
  await click(host.querySelector("#rq-analysis-tab-landing")!);
  expect(probes.overview).toHaveBeenCalledTimes(initialOverview);
  expect(probes.landing.mock.calls.length).toBeGreaterThan(0);
  expect(probes.comparison).toHaveBeenCalledTimes(initialComparison);
});

it("refreshes for a delivered report and uses the latest filters and exact evidence selection", async () => {
  await render();
  const originalCount = probes.overview.mock.calls.length;
  await click(host.querySelector('[aria-label="分析期数"]')!);
  await click([...document.querySelectorAll('[role="option"]')].find((option) => option.textContent === "最近100期")!);
  const request = probes.requests.filter((item) => item.input.window === 100).at(-1)!;
  expect(request.input.window).toBe(100);
  expect(probes.overview).toHaveBeenCalledTimes(originalCount);
  const nextReport = { ...report, cacheKey: "updated-report", window: 100 as const };
  await act(async () => request.deliver(nextReport));
  expect(probes.overview.mock.calls.length).toBeGreaterThan(originalCount);
  expect(probes.overview.mock.calls.at(-1)![0].report).toBe(nextReport);
  await click(host.querySelector("[data-overview]")!);
  expect(host.querySelector('[aria-label="分析期数"]')?.textContent).toContain("最近100期");
  expect(probes.evidence.mock.calls.at(-1)![0]).toMatchObject({ report: nextReport, initialRecord: nextReport.landing.records[0], initialIssue: nextReport.landing.records[0].calculationIssue });
});
