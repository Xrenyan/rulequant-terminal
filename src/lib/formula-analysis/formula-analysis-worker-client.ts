import {
  formulaAnalysisInputKey,
  type FormulaAnalysisReportInput,
} from "@/lib/formula-analysis/build-analysis-report";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";

export type FormulaAnalysisWorkerRequest = { requestId: number; input: FormulaAnalysisReportInput };
export type FormulaAnalysisWorkerResponse =
  | { requestId: number; ok: true; report: FormulaAnalysisReport }
  | { requestId: number; ok: false; error: string };

export type FormulaAnalysisWorkerPort = {
  onmessage: ((event: MessageEvent<FormulaAnalysisWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: FormulaAnalysisWorkerRequest): void;
  terminate(): void;
};

type StartFormulaAnalysisReportOptions = {
  createWorker?: () => FormulaAnalysisWorkerPort;
  onResult(report: FormulaAnalysisReport, source: "worker" | "fallback" | "cache"): void;
  onError?: (message: string) => void;
};

const MAX_CLIENT_CACHE_ENTRIES = 8;
const completedReports = new Map<string, FormulaAnalysisReport>();
const pending = new Map<number, { inputKey: string; options: StartFormulaAnalysisReportOptions }>();
let sharedWorker: FormulaAnalysisWorkerPort | undefined;
let nextRequestId = 0;

function rememberReport(key: string, report: FormulaAnalysisReport): void {
  completedReports.delete(key);
  completedReports.set(key, report);
  while (completedReports.size > MAX_CLIENT_CACHE_ENTRIES) {
    const oldest = completedReports.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    completedReports.delete(oldest);
  }
}

export function clearFormulaAnalysisWorkerResultCache(): void {
  completedReports.clear();
  pending.clear();
  sharedWorker?.terminate();
  sharedWorker = undefined;
}

function failWorker(message: string): void {
  const requests = [...pending.values()];
  pending.clear();
  sharedWorker?.terminate();
  sharedWorker = undefined;
  requests.forEach(({ options }) => options.onError?.(message));
}

function defaultWorker(): FormulaAnalysisWorkerPort {
  return new Worker(
    new URL("../../workers/formula-analysis.worker.ts", import.meta.url),
  ) as FormulaAnalysisWorkerPort;
}

export function startFormulaAnalysisReportRequest(
  input: FormulaAnalysisReportInput,
  options: StartFormulaAnalysisReportOptions,
): () => void {
  const inputKey = formulaAnalysisInputKey(input);
  const cached = completedReports.get(inputKey);
  if (cached) {
    completedReports.delete(inputKey);
    completedReports.set(inputKey, cached);
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) options.onResult(cached, "cache");
    });
    return () => { disposed = true; };
  }
  const requestId = ++nextRequestId;
  try {
    if (!sharedWorker) {
      const worker = (options.createWorker ?? defaultWorker)();
      sharedWorker = worker;
      worker.onmessage = ({ data }) => {
        if (sharedWorker !== worker) return;
        const request = pending.get(data.requestId);
        if (!request) return;
        pending.delete(data.requestId);
        if (data.ok) {
          rememberReport(request.inputKey, data.report);
          request.options.onResult(data.report, "worker");
        } else request.options.onError?.(data.error);
      };
      worker.onerror = () => { if (sharedWorker === worker) failWorker("分析暂时中断，请重新选择条件后重试。"); };
      worker.onmessageerror = () => { if (sharedWorker === worker) failWorker("分析结果读取失败，请重试。"); };
    }
    pending.set(requestId, { inputKey, options });
    sharedWorker.postMessage({ requestId, input });
  } catch (error) {
    pending.delete(requestId);
    failWorker("分析暂时无法启动，请重试。");
    options.onError?.(error instanceof Error ? error.message : "分析暂时无法启动，请重试。");
  }
  return () => { pending.delete(requestId); };
}
