/// <reference lib="webworker" />

import {
  analyzeBinaryTrend,
  analyzeHistoricalNineGrid,
  type HistoricalNineGridMode,
} from "@/lib/special-analysis/special-analysis";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

type SpecialAnalysisRequest =
  | { kind: "nine-grid"; draws: DrawRecord[]; config: RuleQuantConfig; mode: HistoricalNineGridMode }
  | { kind: "binary"; draws: DrawRecord[] };

self.onmessage = (event: MessageEvent<SpecialAnalysisRequest>) => {
  try {
    if (event.data.kind === "nine-grid") {
      self.postMessage({ ok: true, kind: "nine-grid", report: analyzeHistoricalNineGrid(event.data.draws, event.data.config, event.data.mode) });
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
