import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";
import {
  buildFormulaAnalysisReport,
  clearFormulaAnalysisReportCache,
  formulaAnalysisInputKey,
  type FormulaAnalysisReportInput,
} from "@/lib/formula-analysis/build-analysis-report";
import {
  startFormulaAnalysisReportRequest,
  type FormulaAnalysisWorkerPort,
} from "@/lib/formula-analysis/formula-analysis-worker-client";

function reportInput(overrides: Partial<FormulaAnalysisReportInput> = {}): FormulaAnalysisReportInput {
  return {
    draws: seedDraws.slice(-60),
    rules: seedRules.filter((rule) => rule.enabled).slice(0, 6),
    config: defaultConfig,
    window: 10,
    action: "exclude",
    targetType: "zodiac",
    source: {
      label: "本机开奖数据",
      updatedAt: "2026-08-18T01:00:00.000Z",
    },
    now: "2026-08-18T02:00:00.000Z",
    ...overrides,
  };
}

class WorkerStub implements FormulaAnalysisWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

describe("formula analysis report", () => {
  it.each([
    [10, 11],
    [30, 31],
    [50, 51],
  ] as const)("prepares %i completed periods from %i calculation periods", (window, prepared) => {
    clearFormulaAnalysisReportCache();
    const report = buildFormulaAnalysisReport(reportInput({ window }));

    expect(report.summary.periods).toHaveLength(prepared);
    expect(report.landing.records).toHaveLength(window);
    expect(report.landing.pendingPeriod?.isPending).toBe(true);
    expect(report.landing.records.every((record) => record.targetIssue !== undefined)).toBe(true);
  });

  it("reuses an LRU entry and invalidates on draw, rule, or config changes", () => {
    clearFormulaAnalysisReportCache();
    const input = reportInput();
    const first = buildFormulaAnalysisReport(input);
    expect(buildFormulaAnalysisReport(input)).toBe(first);

    const changedDraws = input.draws.map((draw, index) => index === 0
      ? { ...draw, issue: `${draw.issue}-changed` }
      : draw);
    expect(buildFormulaAnalysisReport({ ...input, draws: changedDraws })).not.toBe(first);

    const changedRules = input.rules.map((rule, index) => index === 0
      ? { ...rule, updatedAt: "2026-08-18T03:00:00.000Z" }
      : rule);
    expect(buildFormulaAnalysisReport({ ...input, rules: changedRules })).not.toBe(first);

    const changedConfig = { ...input.config, sevenTailOffsets: [...input.config.sevenTailOffsets, 9] };
    expect(buildFormulaAnalysisReport({ ...input, config: changedConfig })).not.toBe(first);
  });

  it("exposes the same stable input identity used by the completed report", () => {
    clearFormulaAnalysisReportCache();
    const input = reportInput();
    const report = buildFormulaAnalysisReport(input);

    expect(formulaAnalysisInputKey(input)).toBe(report.cacheKey);
    expect(formulaAnalysisInputKey({ ...input, window: 30 })).not.toBe(report.cacheKey);
  });

  it("filters formulas before summary, health, and pair diagnostics", () => {
    clearFormulaAnalysisReportCache();
    const input = reportInput();
    const selectedRule = input.rules[0];
    const report = buildFormulaAnalysisReport({ ...input, ruleIds: [selectedRule.id] });

    expect(report.health.rows.map((row) => row.ruleId)).toEqual([selectedRule.id]);
    expect(report.summary.periods.flatMap((period) => period.contributions)
      .every((contribution) => contribution.ruleId === selectedRule.id)).toBe(true);
    expect(report.pairs.duplicates).toEqual([]);
    expect(report.pairs.conflicts).toEqual([]);
  });
});

describe("formula analysis worker client", () => {
  it("uses a worker result once and terminates the settled worker", () => {
    clearFormulaAnalysisReportCache();
    const worker = new WorkerStub();
    const onResult = vi.fn();
    const input = reportInput();
    startFormulaAnalysisReportRequest(input, { createWorker: () => worker, onResult });
    const report = buildFormulaAnalysisReport(input);

    worker.onmessage?.({ data: { ok: true, report } } as MessageEvent);
    worker.onmessage?.({ data: { ok: true, report: { ...report, cacheKey: "late" } } } as MessageEvent);

    expect(worker.postMessage).toHaveBeenCalledWith(input);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(report, "worker");
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(["error", "messageerror", "unsuccessful"] as const)(
    "falls back synchronously after worker %s and ignores late success",
    (failure) => {
      clearFormulaAnalysisReportCache();
      const worker = new WorkerStub();
      const onResult = vi.fn();
      const input = reportInput();
      startFormulaAnalysisReportRequest(input, { createWorker: () => worker, onResult });
      const late = buildFormulaAnalysisReport(input);

      if (failure === "error") worker.onerror?.({ type: "error" } as ErrorEvent);
      else if (failure === "messageerror") worker.onmessageerror?.(new MessageEvent("messageerror"));
      else worker.onmessage?.({ data: { ok: false, error: "worker failed" } } as MessageEvent);
      worker.onmessage?.({ data: { ok: true, report: { ...late, cacheKey: "late" } } } as MessageEvent);

      expect(onResult).toHaveBeenCalledTimes(1);
      expect(onResult.mock.calls[0][1]).toBe("fallback");
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["constructor", "postMessage"] as const)("recovers when %s throws", (failure) => {
    clearFormulaAnalysisReportCache();
    const worker = new WorkerStub();
    if (failure === "postMessage") {
      worker.postMessage.mockImplementation(() => {
        throw new DOMException("cannot clone", "DataCloneError");
      });
    }
    const onResult = vi.fn();
    startFormulaAnalysisReportRequest(reportInput(), {
      createWorker: () => {
        if (failure === "constructor") throw new Error("constructor failed");
        return worker;
      },
      onResult,
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][1]).toBe("fallback");
    expect(worker.terminate).toHaveBeenCalledTimes(failure === "postMessage" ? 1 : 0);
  });

  it("disposes an unsettled request and ignores its stale response", () => {
    clearFormulaAnalysisReportCache();
    const oldWorker = new WorkerStub();
    const currentWorker = new WorkerStub();
    const onResult = vi.fn();
    const oldInput = reportInput();
    const nextInput = reportInput({ window: 30 });
    const disposeOld = startFormulaAnalysisReportRequest(oldInput, {
      createWorker: () => oldWorker,
      onResult,
    });
    disposeOld();
    startFormulaAnalysisReportRequest(nextInput, {
      createWorker: () => currentWorker,
      onResult,
    });

    oldWorker.onmessage?.({ data: { ok: true, report: buildFormulaAnalysisReport(oldInput) } } as MessageEvent);
    currentWorker.onmessage?.({ data: { ok: true, report: buildFormulaAnalysisReport(nextInput) } } as MessageEvent);

    expect(oldWorker.terminate).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].window).toBe(30);
  });
});
