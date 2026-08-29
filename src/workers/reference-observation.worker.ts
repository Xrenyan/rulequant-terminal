/// <reference lib="webworker" />

import { buildReferenceObservation } from "@/lib/candidate-pool/candidate-pool";
import type { RuleValidationSummary } from "@/lib/rules/rule-validation";
import type { BacktestResult, DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

type ReferenceObservationRequest = {
  requestKey: string;
  window: number;
  dataset?: {
    draws: DrawRecord[];
    rules: RuleRecord[];
    config: RuleQuantConfig;
    backtest: BacktestResult;
    validationSummaries: RuleValidationSummary[];
  };
};

let activeDataset: ReferenceObservationRequest["dataset"];

self.onmessage = (event: MessageEvent<ReferenceObservationRequest>) => {
  try {
    if (event.data.dataset) activeDataset = event.data.dataset;
    if (!activeDataset) throw new Error("历史观察数据尚未准备完成");
    const report = buildReferenceObservation({ ...activeDataset, window: event.data.window });
    self.postMessage({ ok: true, requestKey: event.data.requestKey, report });
  } catch (error) {
    self.postMessage({ ok: false, requestKey: event.data.requestKey, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
