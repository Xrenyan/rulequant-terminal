/// <reference lib="webworker" />

import {
  analyzeBinaryTrend,
  analyzeHistoricalNineGrid,
  type HistoricalNineGridMode,
} from "@/lib/special-analysis/special-analysis";
import { analyzeFixedPatternHistory } from "@/lib/special-analysis/fixed-pattern-analysis";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

type SpecialAnalysisRequest =
  | { kind: "nine-grid"; draws: DrawRecord[]; config: RuleQuantConfig; mode: HistoricalNineGridMode }
  | { kind: "binary"; draws: DrawRecord[] }
  | { kind: "fixed-pattern"; draws: DrawRecord[]; config: RuleQuantConfig; recentLimit?: number };

self.onmessage = (event: MessageEvent<SpecialAnalysisRequest>) => {
  try {
    if (event.data.kind === "nine-grid") {
      self.postMessage({ ok: true, kind: "nine-grid", report: analyzeHistoricalNineGrid(event.data.draws, event.data.config, event.data.mode) });
      return;
    }
    if (event.data.kind === "fixed-pattern") {
      self.postMessage({
        ok: true,
        kind: "fixed-pattern",
        report: analyzeFixedPatternHistory(event.data.draws, event.data.config, {
          recentLimit: event.data.recentLimit,
        }),
      });
      return;
    }
    self.postMessage({
      ok: true,
      kind: "binary",
      size: analyzeBinaryTrend(event.data.draws, "size"),
      parity: analyzeBinaryTrend(event.data.draws, "parity"),
    });
  } catch (error) {
    self.postMessage({ ok: false, kind: event.data.kind, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
