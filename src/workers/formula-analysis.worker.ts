/// <reference lib="webworker" />

import {
  buildFormulaAnalysisReport,
} from "@/lib/formula-analysis/build-analysis-report";
import type { FormulaAnalysisWorkerRequest } from "@/lib/formula-analysis/formula-analysis-worker-client";

self.onmessage = (event: MessageEvent<FormulaAnalysisWorkerRequest>) => {
  const { requestId, input } = event.data;
  try {
    self.postMessage({ requestId, ok: true, report: buildFormulaAnalysisReport(input) });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
