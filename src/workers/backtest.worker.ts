/// <reference lib="webworker" />

import { runBacktest } from "@/lib/backtest/run-backtest";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

type Request = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
};

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const backtest = runBacktest({
      draws: event.data.draws,
      rules: event.data.rules,
      config: event.data.config,
      cache: false,
    });
    self.postMessage({ ok: true, backtest });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
