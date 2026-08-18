import {
  buildFormulaAnalysisReport,
  formulaAnalysisInputKey,
  type FormulaAnalysisReportInput,
} from "@/lib/formula-analysis/build-analysis-report";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";

type FormulaAnalysisWorkerResponse =
  | { ok: true; report: FormulaAnalysisReport }
  | { ok: false; error: string };

export type FormulaAnalysisWorkerPort = {
  onmessage: ((event: MessageEvent<FormulaAnalysisWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: FormulaAnalysisReportInput): void;
  terminate(): void;
};

type StartFormulaAnalysisReportOptions = {
  createWorker?: () => FormulaAnalysisWorkerPort;
  onResult(report: FormulaAnalysisReport, source: "worker" | "fallback" | "cache"): void;
  onError?: (message: string) => void;
};

const MAX_CLIENT_CACHE_ENTRIES = 8;
const completedReports = new Map<string, FormulaAnalysisReport>();

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
  let worker: FormulaAnalysisWorkerPort | undefined;
  let settled = false;
  let disposed = false;

  const terminate = () => {
    worker?.terminate();
  };
  const settle = (report: FormulaAnalysisReport, source: "worker" | "fallback") => {
    if (settled || disposed) return;
    settled = true;
    rememberReport(inputKey, report);
    terminate();
    options.onResult(report, source);
  };
  const recover = (cause: unknown) => {
    if (settled || disposed) return;
    try {
      settle(buildFormulaAnalysisReport(input), "fallback");
    } catch (fallbackError) {
      settled = true;
      terminate();
      const message = fallbackError instanceof Error
        ? fallbackError.message
        : cause instanceof Error
          ? cause.message
          : "公式分析暂时无法完成";
      options.onError?.(message);
    }
  };

  try {
    worker = (options.createWorker ?? defaultWorker)();
    worker.onmessage = (event) => {
      if (settled || disposed) return;
      if (event.data.ok) settle(event.data.report, "worker");
      else recover(new Error(event.data.error));
    };
    worker.onerror = () => recover(new Error("公式分析线程暂时无法启动"));
    worker.onmessageerror = () => recover(new Error("公式分析线程消息无法读取"));
    worker.postMessage(input);
  } catch (error) {
    recover(error);
  }

  return () => {
    if (disposed) return;
    disposed = true;
    if (!settled) terminate();
  };
}
