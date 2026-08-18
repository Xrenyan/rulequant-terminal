/// <reference lib="webworker" />

import {
  buildFormulaAnalysisReport,
  type FormulaAnalysisReportInput,
} from "@/lib/formula-analysis/build-analysis-report";

self.onmessage = (event: MessageEvent<FormulaAnalysisReportInput>) => {
  try {
    self.postMessage({ ok: true, report: buildFormulaAnalysisReport(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
