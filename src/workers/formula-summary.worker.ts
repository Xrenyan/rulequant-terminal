/// <reference lib="webworker" />

import { buildFormulaSummaryReport } from "@/lib/formula-summary/formula-summary";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

type FormulaSummaryRequest = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  maxPeriods: number;
};

self.onmessage = (event: MessageEvent<FormulaSummaryRequest>) => {
  try {
    const report = buildFormulaSummaryReport(event.data);
    self.postMessage({ ok: true, report });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
