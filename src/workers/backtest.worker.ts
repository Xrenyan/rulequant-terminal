/// <reference lib="webworker" />

import { runBacktest } from "@/lib/backtest/run-backtest";
import { packBacktest } from "@/lib/backtest/backtest-transport";
import type { BacktestWorkerRequest } from "@/lib/backtest/backtest-worker-client";

self.onmessage = (event: MessageEvent<BacktestWorkerRequest>) => {
  const { requestId, input, detailRuleIds, fullDetails } = event.data;
  try {
    const backtest = runBacktest({ ...input, cache: true });
    self.postMessage({ requestId, ok: true, packet: packBacktest(backtest, detailRuleIds, fullDetails) });
  } catch (error) {
    self.postMessage({ requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
