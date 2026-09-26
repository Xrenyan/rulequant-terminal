import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";
import { backtestMathKey } from "@/lib/backtest/backtest-identity";
import { clearBacktestCache, runBacktest } from "@/lib/backtest/run-backtest";
import { packBacktest, unpackBacktest } from "@/lib/backtest/backtest-transport";
import { clearBacktestWorkerClient, startBacktestRequest, type BacktestWorkerPort } from "@/lib/backtest/backtest-worker-client";
import { evaluateFormulaEffect } from "@/lib/formula-analysis/formula-effect";
import { buildReferenceObservation } from "@/lib/candidate-pool/candidate-pool";

const input = () => ({ draws: seedDraws.slice(-30), rules: seedRules.filter((rule) => rule.enabled).slice(0, 4), config: defaultConfig });

describe("backtest lightweight transport and math cache", () => {
  beforeEach(() => clearBacktestCache());
  it("preserves every result, future check, trend, and statistical comparison with compact history", () => {
    const data = input();
    const full = runBacktest(data);
    const compact = unpackBacktest(packBacktest(full));
    compact.ruleResults.forEach((result, index) => {
      const expected = full.ruleResults[index];
      expect({ ...result, details: [] }).toEqual({ ...expected, details: [] });
      result.details.forEach((detail, detailIndex) => {
        const original = expected.details[detailIndex];
        expect({ ...detail, formula: "", variables: {}, expression: "", process: [], normalizerSteps: [], targetLabel: "" })
          .toEqual({ ...original, formula: "", variables: {}, expression: "", process: [], normalizerSteps: [], targetLabel: "" });
      });
      expect(evaluateFormulaEffect({ ...data, rule: result.rule, details: result.details, window: 10 }))
        .toEqual(evaluateFormulaEffect({ ...data, rule: expected.rule, details: expected.details, window: 10 }));
    });
    const compactTrend = buildReferenceObservation({ ...data, backtest: compact, window: 10 });
    const fullTrend = buildReferenceObservation({ ...data, backtest: full, window: 10 });
    expect({ ...compactTrend, generatedAt: "" }).toEqual({ ...fullTrend, generatedAt: "" });
    expect(Buffer.byteLength(JSON.stringify(packBacktest(full)))).toBeLessThan(Buffer.byteLength(JSON.stringify(full)) * 0.3);
  });
  it("returns selected formula transcripts and full exports unchanged", () => {
    const full = runBacktest(input());
    const selected = unpackBacktest(packBacktest(full, [full.ruleResults[0].rule.id]));
    expect(selected.ruleResults[0]).toEqual(full.ruleResults[0]);
    expect(selected.ruleResults[1].details[0].process).toEqual([]);
    expect(unpackBacktest(packBacktest(full, [], true))).toEqual(full);
  });
  it("ignores presentation metadata for math but refreshes all current metadata", () => {
    const data = input();
    const first = runBacktest(data);
    const changed = { ...data, rules: data.rules.map((rule) => ({ ...rule, updatedAt: "later", participatesInReference: false, manuallyConfirmed: true, name: `${rule.name} 新名` })) };
    expect(backtestMathKey(changed)).toBe(backtestMathKey(data));
    const second = runBacktest(changed);
    expect(second.ruleResults[0].rule).toEqual(changed.rules[0]);
    expect(second.ruleResults[0].details[0].ruleName).toBe(changed.rules[0].name);
    expect(second.ruleResults[0].details[0].process).toBe(first.ruleResults[0].details[0].process);
  });
  it("recalculates only changed mathematics and never reuses stale historical overrides", () => {
    const data = input();
    const first = runBacktest(data);
    const changed = { ...data, rules: data.rules.map((rule, index) => index ? rule : { ...rule, formula: `${rule.formula}+1` }) };
    const next = runBacktest(changed);
    expect(next.ruleResults[1].details).toBe(first.ruleResults[1].details);
    expect(next.ruleResults[0].details).not.toBe(first.ruleResults[0].details);
    const overridden = { ...data, draws: data.draws.map((draw, index) => index ? draw : { ...draw, rawAttributes: { zodiac: "changed" } }) };
    expect(backtestMathKey(overridden)).not.toBe(backtestMathKey(data));
    expect(runBacktest(overridden).ruleResults[0].details).not.toBe(first.ruleResults[0].details);
  });
});

class WorkerStub implements BacktestWorkerPort {
  onmessage: BacktestWorkerPort["onmessage"] = null;
  onerror: BacktestWorkerPort["onerror"] = null;
  onmessageerror: BacktestWorkerPort["onmessageerror"] = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

describe("persistent background backtest client", () => {
  beforeEach(() => clearBacktestWorkerClient());
  it("keeps one worker, ignores canceled results, and dispatches selected detail requests independently", () => {
    const worker = new WorkerStub();
    const createWorker = vi.fn(() => worker);
    const oldResult = vi.fn();
    const currentResult = vi.fn();
    const data = input();
    const cancel = startBacktestRequest(data, { createWorker, onResult: oldResult });
    cancel();
    startBacktestRequest(data, { createWorker, detailRuleIds: [data.rules[0].id], onResult: currentResult });
    const packet = packBacktest(runBacktest(data), [data.rules[0].id]);
    worker.onmessage?.({ data: { requestId: worker.postMessage.mock.calls[0][0].requestId, ok: true, packet } } as MessageEvent);
    worker.onmessage?.({ data: { requestId: worker.postMessage.mock.calls[1][0].requestId, ok: true, packet } } as MessageEvent);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(oldResult).not.toHaveBeenCalled();
    expect(currentResult).toHaveBeenCalledTimes(1);
    expect(currentResult.mock.calls[0][0].ruleResults[0].details[0].process.length).toBeGreaterThan(0);
  });
  it("reports a failed worker and creates a fresh one for retry", () => {
    const worker = new WorkerStub();
    const onError = vi.fn();
    startBacktestRequest(input(), { createWorker: () => worker, onResult: vi.fn(), onError });
    worker.onerror?.({} as ErrorEvent);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const replacement = new WorkerStub();
    startBacktestRequest(input(), { createWorker: () => replacement, onResult: vi.fn() });
    expect(replacement.postMessage).toHaveBeenCalledTimes(1);
  });
});
