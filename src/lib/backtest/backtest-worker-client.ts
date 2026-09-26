import type { RunBacktestInput } from "@/lib/backtest/run-backtest";
import { unpackBacktest, type BacktestTransport } from "@/lib/backtest/backtest-transport";
import type { BacktestResult } from "@/types/domain";
export { backtestMathKey } from "@/lib/backtest/backtest-identity";

export type BacktestWorkerRequest = { requestId: number; input: RunBacktestInput; detailRuleIds?: string[]; fullDetails?: boolean };
export type BacktestWorkerResponse = { requestId: number; ok: true; packet: BacktestTransport } | { requestId: number; ok: false; error: string };
export type BacktestWorkerPort = {
  onmessage: ((event: MessageEvent<BacktestWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: BacktestWorkerRequest): void;
  terminate(): void;
};
type RequestOptions = {
  detailRuleIds?: string[];
  fullDetails?: boolean;
  createWorker?: () => BacktestWorkerPort;
  onResult(backtest: BacktestResult): void;
  onError?(message: string): void;
};
type Pending = Pick<RequestOptions, "onResult" | "onError">;
const pending = new Map<number, Pending>();
let nextRequestId = 0;
let sharedWorker: BacktestWorkerPort | undefined;

function disposeWorker(message: string) {
  const requests = [...pending.values()];
  pending.clear();
  sharedWorker?.terminate();
  sharedWorker = undefined;
  requests.forEach((request) => request.onError?.(message));
}

export function clearBacktestWorkerClient(): void {
  disposeWorker("历史表现计算已重置，请重新打开页面。");
}

/** A single worker owns the heavy histories across page/filter changes. Cancellation only detaches that request. */
export function startBacktestRequest(input: RunBacktestInput, options: RequestOptions): () => void {
  const requestId = ++nextRequestId;
  try {
    if (!sharedWorker) {
      const worker = options.createWorker?.() ?? new Worker(new URL("../../workers/backtest.worker.ts", import.meta.url)) as BacktestWorkerPort;
      sharedWorker = worker;
      worker.onmessage = ({ data }) => {
        if (sharedWorker !== worker) return;
        const request = pending.get(data.requestId);
        if (!request) return;
        pending.delete(data.requestId);
        if (data.ok) {
          try { request.onResult(unpackBacktest(data.packet)); }
          catch { request.onError?.("历史表现结果读取失败，请重试。"); }
        } else request.onError?.(data.error);
      };
      worker.onerror = () => { if (sharedWorker === worker) disposeWorker("历史表现计算暂时不可用，请重试。"); };
      worker.onmessageerror = () => { if (sharedWorker === worker) disposeWorker("历史表现结果读取失败，请重试。"); };
    }
    pending.set(requestId, options);
    sharedWorker.postMessage({ requestId, input, detailRuleIds: options.detailRuleIds, fullDetails: options.fullDetails });
  } catch (error) {
    pending.delete(requestId);
    disposeWorker("历史表现计算暂时不可用，请重试。");
    options.onError?.(error instanceof Error ? error.message : "历史表现暂时无法启动。");
  }
  return () => { pending.delete(requestId); };
}
