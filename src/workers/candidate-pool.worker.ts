/// <reference lib="webworker" />

import { generateCandidatePool } from "@/lib/candidate-pool/candidate-pool";
import { runBacktest } from "@/lib/backtest/run-backtest";
import type { BacktestResult, DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
import type { RuleValidationSummary } from "@/lib/rules/rule-validation";

type CandidatePoolRequest = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  backtest?: BacktestResult;
  validationSummaries: RuleValidationSummary[];
};

self.onmessage = (event: MessageEvent<CandidatePoolRequest>) => {
  try {
    const backtest = event.data.backtest ?? runBacktest({
      draws: event.data.draws,
      rules: event.data.rules,
      config: event.data.config,
    });
    self.postMessage({ ok: true, report: generateCandidatePool({ ...event.data, backtest }) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
