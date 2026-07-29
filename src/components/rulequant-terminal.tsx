"use client";

import {
  Activity,
  BarChart3,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  Eye,
  FileDown,
  FileJson,
  Gauge,
  Layers3,
  ListChecks,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  TableProperties,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { runRuleCalculation, type RuleCalculation } from "@/lib/rule-engine/rule-engine";
import { buildReferenceObservation, clearCandidatePoolCache, generateCandidatePool } from "@/lib/candidate-pool/candidate-pool";
import type { FormulaDiscoveryCandidate } from "@/lib/formula-discovery/formula-discovery";
import { buildFormulaLedger, buildOneClickFormulaResults, type FormulaLedgerEntry, type OneClickFormulaResult } from "@/lib/formula-ledger/formula-ledger";
import { parseDrawFile, parseDrawText } from "@/lib/parsers/draw-parser";
import { parseRuleTextFile } from "@/lib/parsers/rule-text-parser";
import { runSampleChecks } from "@/lib/sample-check/run-sample-checks";
import { getNumberAttributes, normalizeDraw } from "@/lib/engine/attributes";
import { seedDraws } from "@/lib/data/seed";
import { buildRuleReconciliation, type RuleReconciliationRow } from "@/lib/rules/rule-reconciliation";
import { buildRuleValidationSummaries, canRuleParticipateInReference, type RuleValidationSummary } from "@/lib/rules/rule-validation";
import { buildRuleSignature } from "@/lib/rules/rule-library";
import {
  buildReferenceHistoryItem,
  referenceHistorySignature,
  resolveReferenceHistoryOutcomes,
  type ResolvedReferenceHistoryItem,
} from "@/lib/reference-history/reference-history";
import { useRuleQuantStore } from "@/store/use-rulequant-store";
import type {
  BacktestDetail,
  BacktestResult,
  CandidateEvidence,
  CandidateNumber,
  CandidatePoolReport,
  CandidateZodiac,
  DrawRecord,
  OperationLog,
  ReferenceHistoryNumber,
  ReferenceHistoryZodiac,
  ReferenceObservationReport,
  RuleCategory,
  RuleBacktestResult,
  RuleRecord,
  RuleQuantConfig,
  RuleSourceType,
  SampleCase,
} from "@/types/domain";
import { DataTable } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SpecialAnalysisView } from "@/components/special-analysis-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

let exportersPromise: ReturnType<typeof importExporters> | undefined;
const formulaDiscoveryCache = new Map<string, FormulaDiscoveryCandidate[]>();
const FORMULA_DISCOVERY_CACHE_LIMIT = 6;
const backgroundBacktestCache = new Map<string, BacktestResult>();
const BACKGROUND_BACKTEST_CACHE_LIMIT = 3;
const candidatePoolReportCache = new Map<string, CandidatePoolReport>();
const CANDIDATE_POOL_REPORT_CACHE_LIMIT = 3;

function compactCandidateBacktest(backtest: BacktestResult): BacktestResult {
  return {
    generatedAt: backtest.generatedAt,
    ruleResults: backtest.ruleResults.map((result) => ({
      ...result,
      details: [],
      failedIssues: [],
    })),
  };
}

type CandidateReportWorkerInput = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  backtest?: BacktestResult;
  validationSummaries: RuleValidationSummary[];
};

function runCandidateReportWorker(input: CandidateReportWorkerInput): Promise<CandidatePoolReport> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/candidate-pool.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ ok: boolean; report?: CandidatePoolReport; error?: string }>) => {
      worker.terminate();
      if (event.data.ok && event.data.report) {
        resolve(event.data.report);
        return;
      }
      reject(new Error(event.data.error ?? "综合参考生成失败"));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "综合参考暂时无法启动"));
    };
    worker.postMessage(input);
  });
}

function importExporters() {
  return import("@/lib/export/exporters");
}

function loadExporters() {
  exportersPromise ??= importExporters();
  return exportersPromise;
}

function exportJson(data: unknown, filename: string) {
  void loadExporters().then((module) => module.exportJson(data, filename));
}

function exportDrawsCsv(draws: DrawRecord[]) {
  void loadExporters().then((module) => module.exportDrawsCsv(draws));
}

function exportWorkbook(sheets: Record<string, unknown[]>, filename: string) {
  void loadExporters().then((module) => module.exportWorkbook(sheets, filename));
}

function exportBacktestExcel(result: BacktestResult) {
  void loadExporters().then((module) => module.exportBacktestExcel(result));
}

function exportSampleReport(results: Parameters<Awaited<ReturnType<typeof loadExporters>>["exportSampleReport"]>[0]) {
  void loadExporters().then((module) => module.exportSampleReport(results));
}

function exportCandidatePoolExcel(report: CandidatePoolReport) {
  void loadExporters().then((module) => module.exportCandidatePoolExcel(report));
}

function exportCandidatePoolHtml(report: CandidatePoolReport) {
  void loadExporters().then((module) => module.exportCandidatePoolHtml(report));
}

function exportReferenceHistoryExcel(records: ResolvedReferenceHistoryItem[]) {
  void loadExporters().then((module) => module.exportReferenceHistoryExcel(records));
}

function exportReferenceHistoryText(records: ResolvedReferenceHistoryItem[]) {
  void loadExporters().then((module) => module.exportReferenceHistoryText(records));
}

function exportReferenceHistoryWord(records: ResolvedReferenceHistoryItem[]) {
  void loadExporters()
    .then((module) => module.exportReferenceHistoryWord(records))
    .catch((error) => window.alert(`Word 文档生成失败：${error instanceof Error ? error.message : String(error)}`));
}

function exportRuleLibraryWord(rules: RuleRecord[]) {
  void loadExporters()
    .then((module) => module.exportRuleLibraryWord(rules))
    .catch((error) => window.alert(`Word 文档生成失败：${error instanceof Error ? error.message : String(error)}`));
}

function exportHtmlReport(result: BacktestResult, rules: RuleRecord[], config: RuleQuantConfig) {
  void loadExporters().then((module) => module.exportHtmlReport(result, rules, config));
}

export type ViewKey =
  | "dashboard"
  | "one-click"
  | "formula-detail"
  | "formula-discovery"
  | "special-analysis"
  | "draws"
  | "import"
  | "rules"
  | "formula-editor"
  | "backtest"
  | "candidate-pool"
  | "next-output"
  | "sample-check"
  | "config"
  | "reports"
  | "help";

const navItems: Array<{ key: ViewKey; href: string; label: string; icon: typeof Gauge }> = [
  { key: "dashboard", href: "/dashboard", label: "首页", icon: Gauge },
  { key: "one-click", href: "/one-click", label: "一键算公式", icon: Play },
  { key: "candidate-pool", href: "/candidate-pool", label: "综合参考结果", icon: Activity },
  { key: "special-analysis", href: "/special-analysis", label: "专项概率观察", icon: BarChart3 },
  { key: "draws", href: "/draws", label: "开奖数据", icon: TableProperties },
  { key: "rules", href: "/rules", label: "公式管理", icon: Layers3 },
  { key: "sample-check", href: "/sample-check", label: "公式校验", icon: ClipboardCheck },
  { key: "formula-discovery", href: "/formula-discovery", label: "公式筛选", icon: Search },
  { key: "config", href: "/config", label: "设置", icon: Settings2 },
];

const mobileNavKeys: ViewKey[] = ["dashboard", "one-click", "candidate-pool", "rules"];
const mobileNavItems = navItems.filter((item) => mobileNavKeys.includes(item.key));
const mobileMoreItems = navItems.filter((item) => !mobileNavKeys.includes(item.key));
const REMOTE_DRAW_IMPORT_ENDPOINT = "https://rulequant-terminal.vercel.app/api/import-draws-from-url";
const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const RESUME_SYNC_INTERVAL_MS = 60 * 1000;
const MAX_RULE_LIBRARY_FILE_BYTES = 5 * 1024 * 1024;
const MANUAL_DRAW_KEYS = ["n1", "n2", "n3", "n4", "n5", "n6", "special"] as const;
type ManualDrawKey = typeof MANUAL_DRAW_KEYS[number];

function staticCloudStateUrls() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (typeof window !== "undefined" && (window.location.hostname.endsWith("github.io") || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true") && basePath) {
    return [`${basePath}/static-cloud-state.json`];
  }
  return Array.from(new Set([
    basePath ? `${basePath}/static-cloud-state.json` : "",
    "/static-cloud-state.json",
    "../static-cloud-state.json",
  ].filter(Boolean)));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const viewLabels: Record<ViewKey, string> = {
  dashboard: "首页",
  "one-click": "一键算公式",
  "formula-detail": "公式逐期明细",
  "formula-discovery": "公式筛选",
  "special-analysis": "专项概率观察",
  draws: "开奖数据",
  import: "数据导入",
  rules: "公式管理",
  "formula-editor": "新增规则",
  backtest: "高级回测",
  "candidate-pool": "综合参考结果",
  "next-output": "单期输出",
  "sample-check": "公式校验",
  config: "设置",
  reports: "导出报告",
  help: "规则理解",
};

const categories: Array<{ value: RuleCategory; label: string }> = [
  { value: "include_zodiac", label: "选生肖" },
  { value: "kill_zodiac", label: "杀一肖" },
  { value: "kill_color", label: "杀波色" },
  { value: "kill_half_color", label: "杀半波" },
  { value: "include_color", label: "参考波色" },
  { value: "kill_parity", label: "杀单双" },
  { value: "include_parity", label: "参考单双" },
  { value: "kill_size", label: "杀大小" },
  { value: "include_size", label: "参考大小" },
  { value: "kill_sum", label: "杀一合" },
  { value: "kill_tail", label: "杀一尾" },
  { value: "kill_head", label: "杀一头" },
  { value: "kill_half_head", label: "杀半头" },
  { value: "kill_door", label: "杀一门" },
  { value: "kill_element", label: "杀一行" },
  { value: "kill_segment", label: "杀一段" },
  { value: "seven_tail", label: "七尾" },
  { value: "six_zodiac", label: "取六肖" },
  { value: "eight_zodiac", label: "八肖" },
  { value: "eight_zodiac_two_period", label: "八肖管两期" },
  { value: "nine_zodiac", label: "九肖" },
  { value: "kill_three_as_nine", label: "杀三肖 / 九肖" },
  { value: "custom_set", label: "自定义集合" },
];

const sourceTypeOptions: Array<{ value: RuleSourceType; label: string }> = [
  { value: "user_provided", label: "用户提供公式" },
  { value: "system_recommended", label: "系统推荐公式" },
  { value: "manual", label: "人工新增公式" },
  { value: "example", label: "示例公式" },
];

const extendedSourceTypeOptions: Array<{ value: RuleSourceType; label: string }> = [
  ...sourceTypeOptions,
  { value: "txt_import", label: "TXT 导入公式" },
  { value: "copied", label: "复制公式" },
];

function sourceTypeLabel(sourceType?: RuleSourceType) {
  if (sourceType === "txt_import") return "TXT 导入公式";
  if (sourceType === "copied") return "复制公式";
  return sourceTypeOptions.find((item) => item.value === (sourceType ?? "user_provided"))?.label ?? "用户提供公式";
}

function sourceTypeTone(sourceType?: RuleSourceType): "cyan" | "violet" | "green" | "yellow" | "rose" | "slate" {
  switch (sourceType ?? "user_provided") {
    case "user_provided":
      return "green";
    case "system_recommended":
      return "violet";
    case "manual":
      return "cyan";
    case "txt_import":
      return "yellow";
    case "copied":
      return "green";
    case "example":
      return "slate";
  }
}

const rawRuleFiles = [
  "D序，杀一肖（截止163期，327错8）.txt",
  "D序杀规1（176错3）都是截止156期的数据。红=00蓝=01绿=0(1).txt",
  "L序杀肖一肖规7(1).txt",
  "L序杀肖一肖规8.txt",
  "L序杀一头规.txt",
  "L序杀一行规公式.txt",
  "澳门规：.txt",
  "澳门规1：(1).txt",
  "澳门杀一段规，要的拿走。.txt",
  "澳门杀一段规，要的拿走1。.txt",
  "澳门杀一肖规，共10条.txt",
  "八肖管理两期(此规管2期的。).txt",
  "八肖自用、、(2个括号内的肖都是括号前的肖的对冲+123456。取值123.txt",
  "九肖、、(2个括号内的肖都是括号前的肖的对冲+123456。取值123.txt",
  "九肖自用、、(3个括号内的肖都是括号前的肖的对冲+123456。取值123.txt",
  "杀三肖可以当做九肖用、、20260606、、(取值平7654321.23456.7654321.23456.).txt",
  "单双自用、、20260625、、取值4455(1).txt",
  "澳门七尾规公式2：.txt",
  "杀一肖规，共10条.txt",
  "一条L序杀合数规.txt",
  "最后再给大家一条L序杀合数规.txt",
];

type NextOutputItem =
  | { rule: RuleRecord; calculation: RuleCalculation; error?: never }
  | { rule: RuleRecord; error: string; calculation?: never };

type RuleSaveResult =
  | { ok: true; rule: RuleRecord; message: string }
  | { ok: false; message: string; duplicate?: RuleRecord };

type UrlImportSummary = {
  year: number;
  url: string;
  count: number;
  error?: string;
};

type UrlImportResponse = {
  records: DrawRecord[];
  years: UrlImportSummary[];
  errors: string[];
  fetchedAt?: string;
  latestIssue?: string;
  recordCount?: number;
  state?: { latestIssue?: string; recordCount?: number; updatedAt?: string };
};

let lastAutomaticSourceCheckAt = 0;
let sourceSessionSnapshot: { records: DrawRecord[]; summaries: UrlImportSummary[]; status: string } | undefined;

type CandidateFocus = { type: "number"; value: number } | { type: "zodiac"; value: string } | null;

const EMPTY_CANDIDATE_REPORT: CandidatePoolReport = {
  generatedAt: "",
  latestNumbers: [],
  ruleCount: 0,
  signalCount: 0,
  signals: [],
  allNumbers: [],
  allZodiacs: [],
  topNumbers8: [],
  topNumbers12: [],
  topNumbers16: [],
  topNumbers18: [],
  topZodiacs7: [],
  topZodiacs8: [],
  topZodiacs9: [],
  riskNotice: "",
};

const EMPTY_BACKTEST: BacktestResult = {
  generatedAt: "",
  ruleResults: [],
};

const EMPTY_REFERENCE_OBSERVATION: ReferenceObservationReport = {
  window: 10,
  total: 0,
  top8Hits: 0,
  top12Hits: 0,
  top18Hits: 0,
  zodiac7Hits: 0,
  zodiac9Hits: 0,
  top8Rate: 0,
  top12Rate: 0,
  top18Rate: 0,
  zodiac7Rate: 0,
  zodiac9Rate: 0,
  items: [],
};

const WEBSITE_FIRST_VIEWS = new Set<ViewKey>([
  "dashboard",
  "one-click",
  "formula-detail",
  "formula-discovery",
  "special-analysis",
  "sample-check",
  "backtest",
  "rules",
  "formula-editor",
  "candidate-pool",
  "draws",
  "import",
  "next-output",
  "config",
  "help",
  "reports",
]);

function useDeferredViewReady(active: boolean, delay = 80) {
  const [readyState, setReadyState] = useState({ active, ready: false });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timeoutId: number | undefined;
    const frameId = window.requestAnimationFrame(() => {
      if (!active) {
        setReadyState({ active, ready: false });
        return;
      }
      timeoutId = window.setTimeout(() => setReadyState({ active, ready: true }), delay);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [active, delay]);

  return active && readyState.active === active && readyState.ready;
}

function hasCalculation(item: NextOutputItem): item is { rule: RuleRecord; calculation: RuleCalculation; error?: never } {
  return Boolean(item.calculation);
}

function categoryLabel(category: RuleCategory) {
  return categories.find((item) => item.value === category)?.label ?? category;
}

type RuleHealthRow = {
  rule: RuleRecord;
  result?: RuleBacktestResult;
  wrongStreak: number;
  latestCheckedIssue?: string;
  status: "keep" | "watch" | "reserve" | "manual_reserve";
  reason: string;
};

type RuleSortKey = "smart" | "success_desc" | "recent_desc" | "wrong_asc" | "failed_asc" | "streak_desc" | "name_asc";
type RuleLibraryFilter = "all" | "user_provided" | "system_recommended" | "manual" | "txt_import" | "copied" | "enabled" | "disabled" | "calculable" | "error";

function consecutiveWrong(result?: RuleBacktestResult): number {
  if (!result?.details.length) return 0;
  let count = 0;
  for (let index = result.details.length - 1; index >= 0; index -= 1) {
    if (result.details[index].success) break;
    count += 1;
  }
  return count;
}

function recentSuccessCount(result?: RuleBacktestResult): number {
  return result?.last10.filter(Boolean).length ?? 0;
}

function ruleSmartScore(rule: RuleRecord, result?: RuleBacktestResult): number {
  if (!rule.enabled || !result || result.error || !result.total) return -10000;
  const wrong = consecutiveWrong(result);
  const recentRate = result.last10.length ? recentSuccessCount(result) / result.last10.length * 100 : result.successRate;
  return Number((result.successRate * 1.1 + recentRate * 0.8 + result.currentStreak * 2 + result.maxStreak * 0.4 - wrong * 8 - result.failed * 0.08).toFixed(3));
}

function sortRulesForManagement(rules: RuleRecord[], resultMap: Map<string, RuleBacktestResult>, sortKey: RuleSortKey): RuleRecord[] {
  return [...rules].sort((a, b) => {
    const ar = resultMap.get(a.id);
    const br = resultMap.get(b.id);
    switch (sortKey) {
      case "success_desc":
        return (br?.successRate ?? -1) - (ar?.successRate ?? -1) || a.name.localeCompare(b.name, "zh-CN");
      case "recent_desc":
        return recentSuccessCount(br) - recentSuccessCount(ar) || (br?.successRate ?? 0) - (ar?.successRate ?? 0);
      case "wrong_asc":
        return consecutiveWrong(ar) - consecutiveWrong(br) || (br?.successRate ?? 0) - (ar?.successRate ?? 0);
      case "failed_asc":
        return (ar?.failed ?? Number.MAX_SAFE_INTEGER) - (br?.failed ?? Number.MAX_SAFE_INTEGER) || (br?.successRate ?? 0) - (ar?.successRate ?? 0);
      case "streak_desc":
        return (br?.currentStreak ?? 0) - (ar?.currentStreak ?? 0) || (br?.successRate ?? 0) - (ar?.successRate ?? 0);
      case "name_asc":
        return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
      case "smart":
      default:
        return ruleSmartScore(b, br) - ruleSmartScore(a, ar) || (br?.successRate ?? 0) - (ar?.successRate ?? 0) || a.name.localeCompare(b.name, "zh-CN");
    }
  });
}

function buildRuleHealthRow(rule: RuleRecord, result?: RuleBacktestResult): RuleHealthRow {
  const wrongStreak = consecutiveWrong(result);
  const latestCheckedIssue = result?.details.at(-1)?.currentIssue;
  if (rule.participatesInReference === false) {
    return { rule, result, wrongStreak, latestCheckedIssue, status: "manual_reserve", reason: "已放入备选库：继续回测，但暂不参与综合参考。" };
  }
  if (result?.error || !result?.total) {
    return { rule, result, wrongStreak, latestCheckedIssue, status: "reserve", reason: "计算异常或缺少有效回测，建议先放入备选库并修正公式。" };
  }
  if (wrongStreak >= 10 && result.successRate < 80) {
    return { rule, result, wrongStreak, latestCheckedIssue, status: "reserve", reason: "连错较长且历史命中率不足 80%，建议放入备选库继续观察。" };
  }
  if (wrongStreak > 0) {
    return { rule, result, wrongStreak, latestCheckedIssue, status: "watch", reason: wrongStreak >= 10 ? "虽然连错达到 10 期，但历史命中率仍在 80% 以上，先保留并提醒观察。" : "最近出现错误，继续参与但提醒观察。" };
  }
  return { rule, result, wrongStreak, latestCheckedIssue, status: "keep", reason: "最近未连错，继续参与综合参考。" };
}

function RuleReconciliationPanel({ rows }: { rows: RuleReconciliationRow[] }) {
  const recognized = rows.reduce((sum, row) => sum + row.recognizedCount, 0);
  const failed = rows.reduce((sum, row) => sum + row.failedRecognitionCount, 0);
  const pending = rows.reduce((sum, row) => sum + row.pendingConfirmationCount, 0);
  const participating = rows.reduce((sum, row) => sum + row.participatingCount, 0);

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">规则完整性对账</h2>
          <p className="mt-1 text-sm text-slate-500">按每个 TXT 文件核对：识别了多少条公式、哪些已入库、哪些未做样例核对、哪些参与综合参考结果。</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge tone="cyan">已识别 {recognized}</Badge>
          <Badge tone={failed ? "rose" : "green"}>识别失败 {failed}</Badge>
          <Badge tone={pending ? "yellow" : "green"}>未核对 {pending}</Badge>
          <Badge tone="green">参与 {participating}</Badge>
        </div>
      </div>
      <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-white/[0.08] bg-black/15">
        <table className="w-full min-w-[920px] text-left text-xs">
          <thead className="sticky top-0 bg-[#0b0f1a]/95 text-slate-500 backdrop-blur">
            <tr>
              <th className="px-3 py-3">TXT 文件</th>
              <th className="px-3 py-3">识别</th>
              <th className="px-3 py-3">入库</th>
              <th className="px-3 py-3">失败</th>
              <th className="px-3 py-3">未核对</th>
              <th className="px-3 py-3">不一致</th>
              <th className="px-3 py-3">参与综合参考</th>
              <th className="px-3 py-3">识别公式</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sourceFile} className="border-t border-white/[0.06] text-slate-300">
                <td className="max-w-[320px] px-3 py-3 text-slate-100">{row.sourceFile}</td>
                <td className="px-3 py-3">{row.recognizedCount}</td>
                <td className="px-3 py-3">{row.enteredLibraryCount}</td>
                <td className={cn("px-3 py-3", row.failedRecognitionCount ? "text-rose-200" : "text-slate-500")}>{row.failedRecognitionCount}</td>
                <td className={cn("px-3 py-3", row.pendingConfirmationCount ? "text-amber-200" : "text-slate-500")}>{row.pendingConfirmationCount}</td>
                <td className={cn("px-3 py-3", row.mismatchCount ? "text-rose-200" : "text-slate-500")}>{row.mismatchCount}</td>
                <td className={cn("px-3 py-3", row.participatingCount ? "text-emerald-200" : "text-slate-500")}>{row.participatingCount}</td>
                <td className="max-w-[320px] px-3 py-3 text-slate-400">
                  {row.ruleNames.length ? row.ruleNames.slice(0, 3).join("、") : row.failedReason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function formatLocalDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function FormulaExceptionPanel({
  items,
  calculableCount,
}: {
  items: Array<{ rule: RuleRecord; summary: RuleValidationSummary }>;
  calculableCount: number;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">异常公式集中显示</h2>
          <p className="mt-1 text-sm text-slate-500">这里集中列出不能参与综合参考的公式原因，点击编辑后可直接修复。</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge tone="green">可计算公式：{calculableCount}</Badge>
          <Badge tone={items.length ? "rose" : "green"}>不能参与：{items.length}</Badge>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-100">当前没有需要集中处理的异常公式。</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.slice(0, 8).map(({ rule, summary }) => (
            <div key={rule.id} className="rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-white">{rule.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{sourceTypeLabel(rule.sourceType)} · {categoryLabel(rule.category)} · {rule.orderMode}序</p>
                </div>
                <Badge tone={summary.tone}>{summary.label}</Badge>
              </div>
              <p className="mt-3 text-xs leading-5 text-rose-100">{summary.reason}</p>
              <div className="mt-3 flex gap-2">
                <Link href={`/formula-editor?ruleId=${encodeURIComponent(rule.id)}`} className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs text-slate-100 hover:bg-white/[0.09] max-sm:h-11">
                  编辑修复
                </Link>
                <Button size="sm" onClick={() => void useRuleQuantStore.getState().toggleReferenceParticipation(rule.id)}>
                  {rule.participatesInReference === false ? "加入参考" : "退出参考"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function FormulaLibraryBackupPanel({
  rules,
  backups,
  status,
  onImport,
  onReset,
  onRestore,
}: {
  rules: RuleRecord[];
  backups: Array<{ id: string; createdAt: string; reason: string }>;
  status?: string;
  onImport: (file?: File) => void;
  onReset: () => void;
  onRestore: () => void;
}) {
  const latestBackup = backups[0];
  const [resetArmed, setResetArmed] = useState(false);
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">公式库备份</h2>
          <p className="mt-1 text-sm text-slate-500">公式会自动保存且不限制固定条数；更换设备时，可通过备份文件恢复。</p>
        </div>
        <span className="shrink-0">
          <Badge tone={latestBackup ? "green" : "yellow"}>{latestBackup ? `最近备份 ${formatLocalDateTime(latestBackup.createdAt)}` : "暂无备份"}</Badge>
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="primary" onClick={() => exportRuleLibraryWord(rules)}><FileDown className="h-4 w-4" />一键下载全部公式</Button>
        <Button onClick={() => exportJson({ exportedAt: new Date().toISOString(), rules }, "rulequant-rules-backup.json")}><Download className="h-4 w-4" />导出公式库备份</Button>
        <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-4 text-sm text-slate-100 hover:bg-white/[0.09]">
          <Upload className="h-4 w-4" />导入备份 / TXT
          <input className="hidden" type="file" accept=".json,.txt,application/json,text/plain" onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onImport(event.target.files?.[0]);
            event.currentTarget.value = "";
          }} />
        </label>
        <Button onClick={onRestore} disabled={!latestBackup}><RefreshCw className="h-4 w-4" />恢复上一次公式库</Button>
        <Button
          variant="danger"
          onClick={() => {
            if (!resetArmed) {
              setResetArmed(true);
              return;
            }
            setResetArmed(false);
            onReset();
          }}
        >
          <RefreshCw className="h-4 w-4" />{resetArmed ? "再次点击确认重置" : "重置为内置公式"}
        </Button>
      </div>
      {resetArmed && <p className="mt-3 rounded-md border border-rose-300/25 bg-rose-300/[0.08] p-3 text-sm text-rose-100">此操作会移除人工新增规则。请再次点击红色按钮确认；不操作则不会重置。</p>}
      {status && (
        <div className={cn("mt-4 rounded-lg border p-3 text-sm", status.includes("失败") ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100")}>
          {status}
          {!status.includes("失败") && <Link href="/rules" className="ml-3 text-cyan-100 underline-offset-4 hover:underline">在公式管理查看</Link>}
        </div>
      )}
      {latestBackup && <p className="mt-3 text-xs text-slate-500">最近备份原因：{latestBackup.reason}</p>}
    </Panel>
  );
}

function OperationLogPanel({ logs }: { logs: OperationLog[] }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">运行记录 / 操作日志</h2>
          <p className="mt-1 text-sm text-slate-500">记录同步、计算、公式变更、备份恢复等关键动作，方便后续排错。</p>
        </div>
        <Badge tone="cyan">{logs.length} 条</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {logs.length === 0 && <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-500">暂无运行记录。</p>}
        {logs.slice(0, 8).map((log) => (
          <div key={log.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-slate-100">{log.message}</p>
              <span className="shrink-0 text-xs text-slate-500">{formatLocalDateTime(log.timestamp)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {log.issue ? `期号 ${log.issue} · ` : ""}
              {typeof log.dataCount === "number" ? `数据 ${log.dataCount} 条 · ` : ""}
              {typeof log.formulaCount === "number" ? `公式 ${log.formulaCount} 条 · ` : ""}
              {typeof log.signalCount === "number" ? `依据 ${log.signalCount} 条` : ""}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Metric({ label, value, hint, tone = "cyan" }: { label: string; value: string | number; hint?: string; tone?: "cyan" | "violet" | "green" | "yellow" | "rose" }) {
  const displayValue = String(value);
  return (
    <div className={cn("rq-metric", `rq-metric--${tone}`, displayValue.length > 12 && "is-long")}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="truncate text-xs leading-5 text-slate-500">{label}</p>
        {hint ? <Badge tone={tone}>{hint}</Badge> : null}
      </div>
      <p>{value}</p>
    </div>
  );
}

function IssuePicker({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();

  useEffect(() => {
    if (!open) return;
    function closeWhenOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function positionMenu() {
      if (window.matchMedia("(max-width: 640px)").matches) {
        setMenuStyle(undefined);
        return;
      }
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, window.innerWidth - 32);
      setMenuStyle({
        top: Math.max(16, Math.min(rect.bottom + 9, window.innerHeight - 420)),
        left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
        width,
      });
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function focusOption(index: number) {
    const safeIndex = Math.max(0, Math.min(index, options.length - 1));
    optionRefs.current[safeIndex]?.focus();
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("rq-issue-picker", open && "is-open")}>
      <button
        type="button"
        className="rq-issue-picker__trigger"
        aria-label="选择历史复盘期号"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
            window.requestAnimationFrame(() => focusOption(Math.max(0, options.indexOf(value))));
          }
        }}
      >
        <span><small>复盘期号</small><strong>{value || "请选择"}{value ? "期" : ""}</strong></span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && typeof document !== "undefined" ? createPortal((
        <div ref={menuRef} className="rq-issue-picker__menu rq-issue-picker__portal-menu" style={menuStyle} aria-label="历史期号">
          <div className="rq-issue-picker__menu-head">
            <span><strong>选择复盘期号</strong><small>最近期号在前</small></span>
            <b>{options.length} 期</b>
          </div>
          <div className="rq-issue-picker__options rq-scrollbar" role="listbox">
            {options.map((issue, index) => (
              <button
                key={issue}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                className={cn(issue === value && "is-active")}
                role="option"
                aria-selected={issue === value}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => {
                  onChange(issue);
                  setOpen(false);
                }}
              >
                <span>{issue}期</span>
                {issue === value && <CheckCircle2 className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}

function buildBackgroundBacktestKey(draws: DrawRecord[], rules: RuleRecord[], config: RuleQuantConfig) {
  return JSON.stringify({
    draws: draws.map((draw) => [draw.issue, draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special]),
    rules: rules.map((rule) => [
      rule.id,
      rule.updatedAt,
      rule.enabled,
      rule.category,
      rule.orderMode,
      rule.formula,
      rule.normalizer,
      rule.target,
      rule.positionPattern,
      rule.anchorIssue ?? "",
      rule.anchorPatternIndex ?? "",
      rule.periodSpan,
      rule.verifyOffset ?? "",
    ]),
    config,
  });
}

function FormulaDiscoveryPendingPanel({
  depth,
  elapsedSeconds,
  preparing,
}: {
  depth: "balanced" | "deep" | "advanced";
  elapsedSeconds: number;
  preparing: boolean;
}) {
  const stages = ["生成候选组合", "训练期筛选", "验证期复核", "留出期检查", "稳定性排序"];
  const activeStage = preparing ? 0 : Math.min(4, Math.max(1, Math.floor(elapsedSeconds / 2) + 1));
  const depthLabel = depth === "balanced" ? "稳健组合" : depth === "deep" ? "深度组合" : "高级组合";

  return (
    <Panel className="rq-discovery-pending p-5" aria-live="polite" aria-busy="true">
      <div className="flex items-start gap-3">
        <span className="rq-progress-spinner" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="rq-eyebrow">{depthLabel}</p>
              <h3 className="font-semibold text-white">正在筛选公式</h3>
            </div>
            <Badge tone="cyan">{preparing ? "准备中" : `${elapsedSeconds} 秒`}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">页面可以继续操作，完成后会自动显示候选，不需要重复点击。</p>
          <ol className="rq-progress-steps mt-4">
            {stages.map((stage, index) => (
              <li key={stage} className={cn(index < activeStage && "is-done", index === activeStage && "is-active")}>
                <span>{index < activeStage ? "✓" : index + 1}</span>
                <strong>{stage}</strong>
              </li>
            ))}
          </ol>
          <div className="rq-discovery-skeleton mt-4" aria-hidden="true">
            <div className="rq-discovery-skeleton__list">
              {[0, 1, 2].map((item) => <span key={item}><i /><b /><em /></span>)}
            </div>
            <div className="rq-discovery-skeleton__detail"><i /><b /><b /><em /></div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function NumberTile({ number, special = false, config }: { number: number; special?: boolean; config: RuleQuantConfig }) {
  const label = numberWithZodiac(number, config).split(" ");
  return (
    <span className={cn(
      "rq-number-tile flex h-11 w-11 flex-col items-center justify-center rounded-md border text-center sm:h-12 sm:w-12",
      special ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-50" : "border-white/[0.075] bg-white/[0.04] text-white",
    )}>
      <span className="font-mono text-[15px] leading-none">{padNumber(number)}</span>
      <span className="mt-1 text-xs leading-none text-slate-300">{label[1] ?? ""}</span>
    </span>
  );
}

function DrawHistoryMobileList({ draws, config }: { draws: ReturnType<typeof normalizeDraw>[]; config: RuleQuantConfig }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredDraws = useMemo(() => {
    if (!normalizedQuery) return draws;
    return draws.filter((draw) => [
      draw.issue,
      draw.date,
      draw.n1,
      draw.n2,
      draw.n3,
      draw.n4,
      draw.n5,
      draw.n6,
      draw.special,
      ...draw.lOrder.map((number) => getNumberAttributes(number, config).zodiac),
    ].join(" ").toLowerCase().includes(normalizedQuery));
  }, [config, draws, normalizedQuery]);
  const visibleDraws = filteredDraws.slice(0, visibleCount);

  return (
    <div className="rq-mobile-draws md:hidden">
      <div className="rq-mobile-draws__toolbar">
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(10);
          }}
          placeholder="搜索期号、号码或生肖"
          aria-label="搜索开奖记录"
        />
        <span>显示 {visibleDraws.length}/{filteredDraws.length}</span>
      </div>
      <div className="rq-mobile-draws__list">
        {visibleDraws.map((draw) => {
          const values = [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
          return (
            <article key={draw.issue} className="rq-mobile-draw-card">
              <header>
                <div>
                  <strong>{draw.issue}期</strong>
                  <span>{draw.date || "日期未记录"}</span>
                </div>
                <Badge tone={isManualDrawRecord(draw) ? "cyan" : draw.sourceUrl ? "green" : "slate"}>{isManualDrawRecord(draw) ? "人工录入" : draw.sourceUrl ? "网站/云端" : "本地"}</Badge>
              </header>
              <div className="rq-draw-number-strip" aria-label={`${draw.issue}期开奖`}>
                {values.map((number, index) => {
                  const zodiac = getNumberAttributes(number, config).zodiac;
                  return (
                    <span key={`${draw.issue}-${index}`} className={cn(index === 6 && "is-special")}>
                      <small>{index === 6 ? "特" : index + 1}</small>
                      <strong>{padNumber(number)}</strong>
                      <em>{zodiac}</em>
                    </span>
                  );
                })}
              </div>
              <details>
                <summary>查看 L序 / D序</summary>
                <p><b>L序</b>{draw.lOrder.map((number) => numberWithZodiac(number, config)).join("  ")}</p>
                <p><b>D序</b>{draw.dOrder.map((number) => numberWithZodiac(number, config)).join("  ")}</p>
              </details>
            </article>
          );
        })}
        {!visibleDraws.length && <div className="rq-empty-copy">没有找到匹配的开奖记录。</div>}
      </div>
      {visibleCount < filteredDraws.length && (
        <Button className="mt-3 w-full" onClick={() => setVisibleCount((count) => count + 10)}>再看10期</Button>
      )}
    </div>
  );
}

function LatestDrawCard({ draw, config, issue, source }: { draw: DrawRecord | undefined; config: RuleQuantConfig; issue?: string; source?: string }) {
  const numbers = draw ? [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6] : [];
  return (
    <div className="rq-latest-draw-card min-w-0 p-4 sm:col-span-2 xl:col-span-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-slate-500">最新开奖号码</p>
        <Badge tone="cyan">{issue ?? draw?.issue ?? "-"}</Badge>
      </div>
      {draw ? (
        <div className="rq-latest-draw-strip mt-3 grid grid-cols-4 gap-2 sm:flex sm:min-w-0 sm:flex-wrap sm:items-center">
          {numbers.map((number, index) => <NumberTile key={`${draw.issue}-${index}-${number}`} number={number} config={config} />)}
          <span className="flex h-11 items-center justify-center px-1 font-mono text-lg text-cyan-100 sm:h-12">+</span>
          <NumberTile number={draw.special} special config={config} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">暂无开奖数据</p>
      )}
      <p className="mt-3 text-xs text-slate-500">{source || "平1-6 + 特码，号码下方标注生肖"}</p>
    </div>
  );
}

function codeValue(value: unknown) {
  return <span className="font-mono text-xs text-cyan-100">{String(value)}</span>;
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function isValidDrawNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 49;
}

function normalizeManualDrawNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(49, Math.max(1, Math.round(number)));
}

function numberWithZodiac(value: number, config: RuleQuantConfig) {
  try {
    const attributes = getNumberAttributes(value, config);
    return `${padNumber(value)} ${attributes.zodiac}`;
  } catch {
    return padNumber(value);
  }
}

function drawNumbersWithZodiac(draw: DrawRecord | undefined, config: RuleQuantConfig) {
  if (!draw) return "-";
  return [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special]
    .map((number) => isValidDrawNumber(number) ? numberWithZodiac(number, config) : `${String(number || "-")} 待修正`)
    .join("  ");
}

function candidateNumberLabel(item: Pick<CandidateNumber, "number" | "zodiac">) {
  return `${padNumber(item.number)} ${item.zodiac}`;
}

function sortDrawRecords(records: DrawRecord[]) {
  return [...records].sort((a, b) => {
    const aNumber = /^\d+$/.test(a.issue) ? Number(a.issue) : undefined;
    const bNumber = /^\d+$/.test(b.issue) ? Number(b.issue) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) return aNumber - bNumber;
    if (aNumber !== undefined) return 1;
    if (bNumber !== undefined) return -1;
    return a.issue.localeCompare(b.issue, "zh-CN", { numeric: true });
  });
}

function isManualDrawRecord(record: Pick<DrawRecord, "sourceUrl" | "rawAttributes">) {
  return record.sourceUrl === "manual://user-input" || record.rawAttributes?.sourceType === "manual";
}

function mergeDrawRecords(primary: DrawRecord[], extra: DrawRecord[]) {
  const merged = new Map(primary.map((record) => [record.issue, record]));
  extra.forEach((record) => merged.set(record.issue, record));
  return sortDrawRecords([...merged.values()]);
}

function parsePositionPattern(value: FormDataEntryValue | null): number[] {
  const text = String(value || "").replace(/[平落取循环]/g, "").trim();
  if (/1234567\.1234567/.test(text)) return [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7];
  if (/7654321\.7654321/.test(text)) return [7, 6, 5, 4, 3, 2, 1, 7, 6, 5, 4, 3, 2, 1];
  if (/7654321\.23456/.test(text)) return [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6];
  if (/123456\.5432\.123456\.5432/.test(text)) return [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2];
  if (/123456\.5432/.test(text)) return [1, 2, 3, 4, 5, 6, 5, 4, 3, 2];
  return text
    .split(/[,，.\s]+/)
    .filter(Boolean)
    .flatMap((part) => (/^[1-7]+$/.test(part) ? [...part].map(Number) : [Number(part)]))
    .filter((item) => Number.isFinite(item) && item >= 1 && item <= 7);
  /*
  return String(value || "")
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(Number);
  */
}

function buildRuleFromFormData(formData: FormData, options: { existingRule?: RuleRecord; forceNew?: boolean } = {}): RuleRecord {
  const now = new Date().toISOString();
  const rawId = String(formData.get("id") || "");
  const id = options.forceNew || !rawId ? `rule-${Date.now()}` : rawId;
  const existingRule = options.forceNew ? undefined : options.existingRule;

  return {
    id,
    name: String(formData.get("name") || "未命名规则"),
    category: String(formData.get("category") || "kill_zodiac") as RuleCategory,
    orderMode: String(formData.get("orderMode") || "L") as RuleRecord["orderMode"],
    formula: String(formData.get("formula") || "平1 + 特码尾"),
    normalizer: String(formData.get("normalizer") || "auto"),
    target: String(formData.get("target") || "special"),
    verifyMode: "next_special",
    positionPattern: parsePositionPattern(formData.get("positionPattern")),
    anchorIssue: String(formData.get("anchorIssue") || "") || undefined,
    anchorPatternIndex: formData.get("anchorPatternIndex") === null || String(formData.get("anchorPatternIndex") || "") === "" ? undefined : Number(formData.get("anchorPatternIndex")),
    positionMeaning: String(formData.get("positionMeaning") || "") || undefined,
    periodSpan: Number(formData.get("periodSpan") || 1),
    verifyOffset: Number(formData.get("verifyOffset") || formData.get("periodSpan") || 1),
    enabled: formData.get("enabled") === "on",
    manuallyConfirmed: formData.get("manuallyConfirmed") === "on",
    participatesInReference: formData.get("participatesInReference") === "on",
    sourceType: String(formData.get("sourceType") || existingRule?.sourceType || "manual") as RuleSourceType,
    tags: String(formData.get("tags") || "")
      .split(/[,，\s]+/)
      .filter(Boolean),
    description: String(formData.get("description") || ""),
    sourceFile: String(formData.get("sourceFile") || "手动录入"),
    examples: existingRule?.examples ?? [],
    createdAt: existingRule?.createdAt ?? now,
    updatedAt: now,
  };
}

export function RuleQuantTerminal({ activeView }: { activeView: ViewKey }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[#070b12] p-6 text-slate-100">
        <Panel className="mx-auto max-w-6xl p-6">
          <Badge tone="cyan">RuleQuant</Badge>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight text-white">{viewLabels[activeView]}</h1>
          <p className="mt-2 text-sm text-slate-500">正在加载本地公式库和开奖数据...</p>
        </Panel>
      </main>
    );
  }

  return <RuleQuantTerminalClient activeView={activeView} />;
}

function RuleQuantTerminalClient({ activeView }: { activeView: ViewKey }) {
  const searchParams = useSearchParams();
  const store = useRuleQuantStore();
  const { draws, rules, samples, operationLogs, ruleBackups, referenceHistory, config, selectedRuleId, cloudStateMeta, cloudPublishStatus, cloudPublishMessage, hasHydrated } = store;
  const hydrate = store.hydrate;
  const [importText, setImportText] = useState("issue,n1,n2,n3,n4,n5,n6,special\n2026166,8,13,19,27,35,44,6");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [previewDraws, setPreviewDraws] = useState<DrawRecord[]>([]);
  const [sourceUrl, setSourceUrl] = useState("https://thjffv.ag0rkv-4pnok-ljvvrg.xyz:16633/kj/3/2026.html");
  const [sourceFromYear, setSourceFromYear] = useState(String(new Date().getFullYear()));
  const [sourceToYear, setSourceToYear] = useState(String(new Date().getFullYear()));
  const [sourceRecords, setSourceRecords] = useState<DrawRecord[]>(() => sourceSessionSnapshot?.records ?? []);
  const [sourceSummaries, setSourceSummaries] = useState<UrlImportSummary[]>(() => sourceSessionSnapshot?.summaries ?? []);
  const [sourceStatus, setSourceStatus] = useState(() => sourceSessionSnapshot?.status ?? "");
  const [sourceLoading, setSourceLoading] = useState(false);
  const referenceAutoSavedSignature = useRef("");
  const [candidateTab, setCandidateTab] = useState<"numbers8" | "numbers12" | "numbers18" | "numbers16" | "numbers49" | "zodiacs12" | "zodiacs9" | "zodiacs8" | "zodiacs7">("numbers8");
  const [candidateWorkspaceTab, setCandidateWorkspaceTab] = useState<"results" | "evidence" | "history" | "combo" | "operations">("results");
  const [rulesWorkspaceTab, setRulesWorkspaceTab] = useState<"library" | "health" | "reconcile">("library");
  const [candidateFocus, setCandidateFocus] = useState<CandidateFocus>(null);
  const [referenceGeneratedAt, setReferenceGeneratedAt] = useState("");
  const [referenceRunId, setReferenceRunId] = useState(0);
  const [referenceCalculating, setReferenceCalculating] = useState(false);
  const [referenceStatus, setReferenceStatus] = useState("");
  const [oneClickCalculating, setOneClickCalculating] = useState(false);
  const [oneClickStatus, setOneClickStatus] = useState("");
  const [pendingRoute, setPendingRoute] = useState("");
  const [mobileNavCompact, setMobileNavCompact] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreCloseRef = useRef<HTMLButtonElement>(null);
  const [backgroundBacktestState, setBackgroundBacktestState] = useState<{
    key: string;
    result?: BacktestResult;
    loading: boolean;
    error: string;
  }>({ key: "", loading: false, error: "" });
  const [candidateReportState, setCandidateReportState] = useState<{
    key: string;
    report?: CandidatePoolReport;
    loading: boolean;
    error: string;
  }>({ key: "", loading: false, error: "" });
  const [discoveryFocusId, setDiscoveryFocusId] = useState("");
  const [discoveryStatus, setDiscoveryStatus] = useState("");
  const [discoveryDepth, setDiscoveryDepth] = useState<"balanced" | "deep" | "advanced">("balanced");
  const [discoveryResult, setDiscoveryResult] = useState<{ key: string; candidates: FormulaDiscoveryCandidate[] }>({ key: "", candidates: [] });
  const [discoveryRefreshId, setDiscoveryRefreshId] = useState(0);
  const [discoveryElapsedSeconds, setDiscoveryElapsedSeconds] = useState(0);
  const [ruleLibraryStatus, setRuleLibraryStatus] = useState("");
  const [lastCalculationAt, setLastCalculationAt] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("rulequant:lastCalculationAt") ?? ""));
  const [lastSyncAt, setLastSyncAt] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem("rulequant:lastSyncAt") ?? ""));
  const [ledgerVisibleState, setLedgerVisibleState] = useState({ ruleId: "", count: 20 });
  const [oneClickMode, setOneClickMode] = useState<"latest" | "manual">("latest");
  const [manualDraw, setManualDraw] = useState<DrawRecord>(() => ({
    issue: `manual-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`,
    n1: 1,
    n2: 2,
    n3: 3,
    n4: 4,
    n5: 5,
    n6: 6,
    special: 7,
  }));
  const [ruleFilter, setRuleFilter] = useState<RuleCategory | "all">("all");
  const [ruleLibraryFilter, setRuleLibraryFilter] = useState<RuleLibraryFilter>("all");
  const [ruleSort, setRuleSort] = useState<RuleSortKey>("smart");
  const [rulePage, setRulePage] = useState(0);
  const [mobileRuleToolsOpen, setMobileRuleToolsOpen] = useState(false);
  const [oneClickPage, setOneClickPage] = useState(0);
  const [selectedComboRuleIds, setSelectedComboRuleIds] = useState<string[]>([]);
  const [referenceArchiveIssue, setReferenceArchiveIssue] = useState("");
  const [referenceArchiveSaving, setReferenceArchiveSaving] = useState(false);
  const [sampleDraft, setSampleDraft] = useState({ ruleId: selectedRuleId, issue: draws[0]?.issue ?? "", expectedRawResult: "", expectedFinalResult: "", expectedMappedResult: "", expectedSuccess: "true" });

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      setPendingRoute("");
      setMobileNavCompact(false);
      setMobileMoreOpen(false);
    });
    return () => { disposed = true; };
  }, [activeView]);

  useEffect(() => {
    if (!mobileMoreOpen) return;

    const previousOverflow = document.documentElement.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMobileMoreOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMoreOpen(false);
    };

    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    window.requestAnimationFrame(() => mobileMoreCloseRef.current?.focus());

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [mobileMoreOpen]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let frameId = 0;

    function handleScroll() {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        const nextScrollY = window.scrollY;
        const scrollingDown = nextScrollY > lastScrollY + 3;
        const scrollingUp = nextScrollY < lastScrollY - 5;
        if (nextScrollY < 48 || scrollingUp) setMobileNavCompact(false);
        else if (nextScrollY > 140 && scrollingDown) setMobileNavCompact(true);
        lastScrollY = nextScrollY;
        frameId = 0;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? rules[0];
  const editorMode = searchParams.get("mode");
  const editorRuleId = searchParams.get("ruleId");
  const editorRule =
    activeView === "formula-editor" && editorMode === "new"
      ? undefined
      : activeView === "formula-editor" && editorRuleId
        ? rules.find((rule) => rule.id === editorRuleId)
        : selectedRule;
  const ledgerVisibleCount = ledgerVisibleState.ruleId === selectedRuleId ? ledgerVisibleState.count : 20;
  const websiteDraws = useMemo(() => sortDrawRecords(sourceRecords), [sourceRecords]);
  const manualLocalDraws = useMemo(() => sortDrawRecords(draws.filter(isManualDrawRecord)), [draws]);
  const activeDraws = useMemo(
    () => websiteDraws.length ? mergeDrawRecords(websiteDraws, manualLocalDraws) : sortDrawRecords(draws),
    [draws, manualLocalDraws, websiteDraws],
  );
  const normalizedDraws = useMemo(() => activeDraws.map((draw) => normalizeDraw(draw, config)), [activeDraws, config]);
  const latestDraw = normalizedDraws.at(-1);
  const latestRawDraw = activeDraws.at(-1);
  const latestPeriodIndex = Math.max(normalizedDraws.length - 1, 0);
  const selectedReferenceArchiveIssue = referenceArchiveIssue || latestRawDraw?.issue || "";
  const hasManualDraws = manualLocalDraws.length > 0;
  const hasLiveDraws = activeDraws.some((draw) => Boolean(draw.sourceUrl) && !isManualDrawRecord(draw));
  const isSeedOnly = !hasLiveDraws && draws.length === seedDraws.length && draws.every((draw, index) => draw.issue === seedDraws[index]?.issue);
  const isCloudData = Boolean(cloudStateMeta?.enabled && cloudStateMeta.recordCount);
  const hasSharedDraws = hasLiveDraws || isCloudData || websiteDraws.length > 0 || hasManualDraws;
  const isStaticShareHost = typeof window !== "undefined" && (window.location.hostname.endsWith("github.io") || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true");
  const hasCloudAdminToken = typeof window !== "undefined" && Boolean(window.localStorage.getItem("rulequant:adminToken"));
  const showCloudPublishControls = hasCloudAdminToken || !isStaticShareHost;
  const cloudSyncAt = cloudStateMeta?.updatedAt ? new Date(cloudStateMeta.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "";
  const staticSnapshotAt = isStaticShareHost && hasSharedDraws ? (cloudSyncAt || latestRawDraw?.date || "静态快照") : "";
  const displayLastSyncAt = lastSyncAt || cloudSyncAt || staticSnapshotAt;
  const isUsingSyncedData = websiteDraws.length > 0 || isCloudData || hasLiveDraws;
  const dataSourceLabel = sourceLoading
    ? "同步中"
    : websiteDraws.length && hasManualDraws
      ? "网站全年数据 + 人工录入"
    : websiteDraws.length
        ? "网站全年数据"
        : isCloudData && hasManualDraws
          ? "云端数据库 + 人工录入"
          : isCloudData
            ? "云端数据库"
            : hasLiveDraws
              ? "实时网址"
              : hasManualDraws
                ? "本地库 + 人工录入"
              : isSeedOnly
                ? "示例数据"
                : "本地库";
  const sourceRecordBadgeTone = sourceRecords.length || (isStaticShareHost && hasSharedDraws) ? "green" : "slate";
  const sourceRecordBadgeLabel = sourceRecords.length
    ? `${sourceRecords.length} 条网址记录${hasManualDraws ? ` + ${manualLocalDraws.length} 条人工` : ""}`
    : isStaticShareHost && hasSharedDraws
      ? `${activeDraws.length} 条静态记录`
      : "未同步";
  const shouldWarnStaleData = !websiteDraws.length && !(isStaticShareHost && hasSharedDraws);
  const latestNumbersLabel = drawNumbersWithZodiac(latestRawDraw, config);
  const isCandidatePoolReady = useDeferredViewReady(activeView === "candidate-pool");
  const isCandidateHistoryReady = useDeferredViewReady(activeView === "candidate-pool" && candidateWorkspaceTab === "history", 120);
  const isFormulaDiscoveryReady = useDeferredViewReady(activeView === "formula-discovery");
  const isOneClickReady = useDeferredViewReady(activeView === "one-click", 40);
  const isFormulaDiscoveryPreparing = activeView === "formula-discovery" && !isFormulaDiscoveryReady;
  const isCandidatePoolPreparing = activeView === "candidate-pool" && !isCandidatePoolReady;
  const isCandidateHistoryPreparing = activeView === "candidate-pool" && candidateWorkspaceTab === "history" && (!isCandidatePoolReady || !isCandidateHistoryReady);
  const isOneClickPreparing = activeView === "one-click" && !isOneClickReady;
  const usesBackgroundBacktest =
    activeView === "dashboard" ||
    activeView === "rules" ||
    activeView === "formula-detail" ||
    activeView === "sample-check" ||
    activeView === "backtest" ||
    activeView === "reports" ||
    (activeView === "candidate-pool" && isCandidatePoolReady);
  const backgroundBacktestKey = useMemo(
    () => usesBackgroundBacktest ? buildBackgroundBacktestKey(activeDraws, rules, config) : "",
    [usesBackgroundBacktest, activeDraws, rules, config],
  );
  useEffect(() => {
    if (!usesBackgroundBacktest || !backgroundBacktestKey) return;

    const cached = backgroundBacktestCache.get(backgroundBacktestKey);
    if (cached) {
      backgroundBacktestCache.delete(backgroundBacktestKey);
      backgroundBacktestCache.set(backgroundBacktestKey, cached);
      let disposed = false;
      queueMicrotask(() => {
        if (!disposed) setBackgroundBacktestState({ key: backgroundBacktestKey, result: cached, loading: false, error: "" });
      });
      return () => { disposed = true; };
    }

    const worker = new Worker(new URL("../workers/backtest.worker.ts", import.meta.url));
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) setBackgroundBacktestState({ key: backgroundBacktestKey, loading: true, error: "" });
    });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; backtest?: BacktestResult; error?: string }>) => {
      if (disposed) return;
      if (!event.data.ok || !event.data.backtest) {
        setBackgroundBacktestState({ key: backgroundBacktestKey, loading: false, error: event.data.error ?? "历史表现计算失败" });
        return;
      }
      backgroundBacktestCache.set(backgroundBacktestKey, event.data.backtest);
      while (backgroundBacktestCache.size > BACKGROUND_BACKTEST_CACHE_LIMIT) {
        const oldestKey = backgroundBacktestCache.keys().next().value;
        if (!oldestKey) break;
        backgroundBacktestCache.delete(oldestKey);
      }
      setBackgroundBacktestState({ key: backgroundBacktestKey, result: event.data.backtest, loading: false, error: "" });
    };
    worker.onerror = () => {
      if (!disposed) setBackgroundBacktestState({ key: backgroundBacktestKey, loading: false, error: "历史表现暂时无法整理，请刷新后重试" });
    };
    worker.postMessage({ draws: activeDraws, rules, config });
    return () => {
      disposed = true;
      worker.terminate();
    };
  }, [usesBackgroundBacktest, activeDraws, rules, config, backgroundBacktestKey]);

  const backgroundBacktest = backgroundBacktestState.key === backgroundBacktestKey ? backgroundBacktestState.result : undefined;
  const isBackgroundBacktestCalculating = usesBackgroundBacktest && backgroundBacktestState.key === backgroundBacktestKey && backgroundBacktestState.loading;
  const backgroundBacktestError = usesBackgroundBacktest && backgroundBacktestState.key === backgroundBacktestKey ? backgroundBacktestState.error : "";
  const isRuleManagementCalculating = activeView === "rules" && isBackgroundBacktestCalculating;
  const ruleManagementBacktestError = activeView === "rules" ? backgroundBacktestError : "";
  const backtest = backgroundBacktest ?? EMPTY_BACKTEST;
  const selectedRuleResult = useMemo(() => backtest.ruleResults.find((item) => item.rule.id === selectedRule?.id) ?? backtest.ruleResults[0], [backtest, selectedRule?.id]);
  const shouldBuildValidation = Boolean(backgroundBacktest) && (
    activeView === "dashboard"
    || activeView === "rules"
    || activeView === "formula-detail"
    || activeView === "sample-check"
    || (activeView === "candidate-pool" && isCandidatePoolReady)
  );
  const validationSampleResults = useMemo(() => {
    if (!shouldBuildValidation) return [];
    return runSampleChecks({ cases: samples, draws: activeDraws, rules, config, backtest });
  }, [shouldBuildValidation, samples, activeDraws, rules, config, backtest]);
  const ruleValidationSummaries = useMemo(() => (
    shouldBuildValidation ? buildRuleValidationSummaries({ rules, backtest, sampleResults: validationSampleResults }) : []
  ), [shouldBuildValidation, rules, backtest, validationSampleResults]);
  const ruleReconciliationRows = useMemo(() => (
    activeView === "rules" && rulesWorkspaceTab === "reconcile" ? buildRuleReconciliation({ sourceFiles: rawRuleFiles, rules, validationSummaries: ruleValidationSummaries }) : []
  ), [activeView, rulesWorkspaceTab, rules, ruleValidationSummaries]);
  const ruleValidationById = useMemo(() => new Map(ruleValidationSummaries.map((summary) => [summary.ruleId, summary])), [ruleValidationSummaries]);
  const enabledRuleCount = useMemo(() => rules.filter((rule) => rule.enabled).length, [rules]);
  const passedRuleCount = useMemo(() => ruleValidationSummaries.filter((summary) => summary.status === "checked").length, [ruleValidationSummaries]);
  const checkedSampleRuleCount = useMemo(() => ruleValidationSummaries.filter((summary) => summary.sampleCount > 0).length, [ruleValidationSummaries]);
  const uncheckedSampleRuleCount = useMemo(() => ruleValidationSummaries.filter((summary) => summary.status === "unchecked").length, [ruleValidationSummaries]);
  const calculableRuleCount = useMemo(() => {
    if (!backtest.ruleResults.length) {
      return rules.filter((rule) => canRuleParticipateInReference(rule)).length;
    }
    return backtest.ruleResults.filter((result) => result.rule.enabled && !result.error && result.total > 0).length;
  }, [backtest.ruleResults, rules]);
  const referenceRuleCount = useMemo(() => rules.filter((rule) => canRuleParticipateInReference(rule, ruleValidationById.get(rule.id))).length, [rules, ruleValidationById]);
  const pendingRuleCount = useMemo(() => ruleValidationSummaries.filter((summary) => summary.status === "unchecked").length, [ruleValidationSummaries]);
  const excludedRuleCount = Math.max(enabledRuleCount - referenceRuleCount, 0);
  const userProvidedRuleCount = useMemo(() => rules.filter((rule) => (rule.sourceType ?? "user_provided") === "user_provided").length, [rules]);
  const manualRuleCount = useMemo(() => rules.filter((rule) => rule.sourceType === "manual").length, [rules]);
  const systemRecommendedRuleCount = useMemo(() => rules.filter((rule) => rule.sourceType === "system_recommended").length, [rules]);
  const exceptionRules = useMemo(() => ruleValidationSummaries
    .map((summary) => ({ summary, rule: rules.find((rule) => rule.id === summary.ruleId) }))
    .filter((item): item is { summary: RuleValidationSummary; rule: RuleRecord } => Boolean(item.rule))
    .filter(({ rule, summary }) => rule.enabled && !canRuleParticipateInReference(rule, summary)),
  [ruleValidationSummaries, rules]);
  const ruleHealthRows = useMemo(() => {
    const needsHealthRows =
      (activeView === "rules" && rulesWorkspaceTab === "health")
      || (activeView === "candidate-pool" && candidateWorkspaceTab === "operations");
    if (!needsHealthRows || !backtest.ruleResults.length) return [];
    const resultMap = new Map(backtest.ruleResults.map((result) => [result.rule.id, result]));
    return rules
      .filter((rule) => rule.enabled)
      .map((rule) => buildRuleHealthRow(rule, resultMap.get(rule.id)))
      .sort((a, b) => {
        const order = { reserve: 0, manual_reserve: 1, watch: 2, keep: 3 } as const;
        return order[a.status] - order[b.status] || b.wrongStreak - a.wrongStreak || (b.result?.successRate ?? 0) - (a.result?.successRate ?? 0);
      });
  }, [activeView, backtest.ruleResults, candidateWorkspaceTab, rules, rulesWorkspaceTab]);
  const ruleResultMap = useMemo(() => new Map(backtest.ruleResults.map((result) => [result.rule.id, result])), [backtest.ruleResults]);
  const visibleRules = useMemo(() => {
    const filtered = rules.filter((rule) => {
      if (ruleFilter !== "all" && rule.category !== ruleFilter) return false;
      const result = ruleResultMap.get(rule.id);
      switch (ruleLibraryFilter) {
        case "user_provided":
        case "system_recommended":
        case "manual":
        case "txt_import":
        case "copied":
          return (rule.sourceType ?? "user_provided") === ruleLibraryFilter;
        case "enabled":
          return rule.enabled;
        case "disabled":
          return !rule.enabled;
        case "calculable":
          return Boolean(result && !result.error && result.total > 0);
        case "error":
          return Boolean(result?.error || (rule.enabled && result && result.total === 0));
        case "all":
        default:
          return true;
      }
    });
    return sortRulesForManagement(filtered, ruleResultMap, ruleSort);
  }, [rules, ruleFilter, ruleLibraryFilter, ruleResultMap, ruleSort]);
  const rulePageSize = 7;
  const rulePageCount = Math.max(1, Math.ceil(visibleRules.length / rulePageSize));
  const safeRulePage = Math.min(rulePage, rulePageCount - 1);
  const pagedRules = visibleRules.slice(safeRulePage * rulePageSize, (safeRulePage + 1) * rulePageSize);
  const inspectedRule = visibleRules.find((rule) => rule.id === selectedRuleId) ?? visibleRules[0];
  const inspectedRuleResult = inspectedRule ? ruleResultMap.get(inspectedRule.id) : undefined;
  const inspectedRuleSummary = inspectedRule ? ruleValidationById.get(inspectedRule.id) : undefined;
  const sampleResults = useMemo(() => {
    if (activeView !== "sample-check" && activeView !== "reports") return [];
    return validationSampleResults.length ? validationSampleResults : runSampleChecks({ cases: samples, draws: activeDraws, rules, config });
  }, [activeView, validationSampleResults, samples, activeDraws, rules, config]);
  const nextOutputs = useMemo<NextOutputItem[]>(() => {
    if (activeView !== "next-output") return [];
    if (!latestDraw) return [];
    return rules
      .filter((rule) => rule.enabled)
      .map((rule) => {
        try {
          return { rule, calculation: runRuleCalculation(rule, latestDraw, config, { periodIndex: latestPeriodIndex }) };
        } catch (error) {
          return { rule, error: error instanceof Error ? error.message : String(error) };
        }
      });
  }, [activeView, rules, latestDraw, latestPeriodIndex, config]);
  const researchDraws = activeDraws;
  const shouldBuildCandidateReport = Boolean(backgroundBacktest) && (
    activeView === "dashboard"
    || (activeView === "candidate-pool" && isCandidatePoolReady)
    || activeView === "reports"
  );
  const candidateBacktest = backtest;
  const candidateReportKey = shouldBuildCandidateReport ? `${backgroundBacktestKey}:${referenceRunId}` : "";
  useEffect(() => {
    if (!shouldBuildCandidateReport || !candidateReportKey) return;
    const cached = candidatePoolReportCache.get(candidateReportKey);
    if (cached) {
      candidatePoolReportCache.delete(candidateReportKey);
      candidatePoolReportCache.set(candidateReportKey, cached);
      let disposed = false;
      queueMicrotask(() => {
        if (!disposed) setCandidateReportState({ key: candidateReportKey, report: cached, loading: false, error: "" });
      });
      return () => { disposed = true; };
    }
    let disposed = false;
    const worker = new Worker(new URL("../workers/candidate-pool.worker.ts", import.meta.url));
    queueMicrotask(() => {
      if (!disposed) setCandidateReportState({ key: candidateReportKey, loading: true, error: "" });
    });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; report?: CandidatePoolReport; error?: string }>) => {
      if (disposed) return;
      if (!event.data.ok || !event.data.report) {
        setCandidateReportState({ key: candidateReportKey, loading: false, error: event.data.error ?? "综合参考生成失败" });
        worker.terminate();
        return;
      }
      candidatePoolReportCache.set(candidateReportKey, event.data.report);
      while (candidatePoolReportCache.size > CANDIDATE_POOL_REPORT_CACHE_LIMIT) {
        const oldestKey = candidatePoolReportCache.keys().next().value;
        if (typeof oldestKey !== "string") break;
        candidatePoolReportCache.delete(oldestKey);
      }
      startTransition(() => {
        setCandidateReportState({ key: candidateReportKey, report: event.data.report, loading: false, error: "" });
      });
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (disposed) return;
      setCandidateReportState({ key: candidateReportKey, loading: false, error: event.message || "综合参考暂时无法生成" });
      worker.terminate();
    };
    worker.postMessage({
      draws: researchDraws,
      rules,
      config,
      backtest: compactCandidateBacktest(candidateBacktest),
      validationSummaries: ruleValidationSummaries,
    });
    return () => {
      disposed = true;
      worker.terminate();
    };
  }, [shouldBuildCandidateReport, candidateReportKey, researchDraws, rules, config, candidateBacktest, ruleValidationSummaries]);
  const candidateReport = candidateReportState.key === candidateReportKey && candidateReportState.report ? candidateReportState.report : EMPTY_CANDIDATE_REPORT;
  const isCandidateReportCalculating = shouldBuildCandidateReport && (candidateReportState.key !== candidateReportKey || candidateReportState.loading);
  const candidateReportError = shouldBuildCandidateReport && candidateReportState.key === candidateReportKey ? candidateReportState.error : "";
  const isCandidateReferencePreparing = isBackgroundBacktestCalculating || isCandidateReportCalculating;
  useEffect(() => {
    if (activeView !== "candidate-pool") return;
    if (!candidateReport.signalCount || !candidateReport.ruleCount) return;
    const signature = referenceHistorySignature(candidateReport);
    if (referenceAutoSavedSignature.current === signature) return;
    referenceAutoSavedSignature.current = signature;
    if (referenceHistory.some((record) => record.signature === signature)) return;
    const saveTimer = window.setTimeout(() => {
      void store.saveReferenceHistory(buildReferenceHistoryItem({
        report: candidateReport,
        saveType: "auto",
        dataSourceLabel,
        recordCount: activeDraws.length,
        note: "生成综合参考结果后自动保存",
      }));
    }, 500);
    return () => window.clearTimeout(saveTimer);
  }, [activeDraws.length, activeView, candidateReport, dataSourceLabel, referenceHistory, store]);
  const referenceObservation = useMemo(() => {
    if (activeView !== "candidate-pool" || candidateWorkspaceTab !== "history" || !isCandidatePoolReady || !isCandidateHistoryReady) return EMPTY_REFERENCE_OBSERVATION;
    void referenceRunId;
    return buildReferenceObservation({ draws: researchDraws, rules, config, validationSummaries: ruleValidationSummaries, window: 10 });
  }, [activeView, candidateWorkspaceTab, isCandidateHistoryReady, isCandidatePoolReady, researchDraws, rules, config, ruleValidationSummaries, referenceRunId]);
  const resolvedReferenceHistory = useMemo<ResolvedReferenceHistoryItem[]>(() => {
    if (activeView !== "reports" && !(activeView === "candidate-pool" && candidateWorkspaceTab === "history")) return [];
    return resolveReferenceHistoryOutcomes(referenceHistory, activeDraws, config);
  }, [activeDraws, activeView, candidateWorkspaceTab, config, referenceHistory]);
  const manualComboRules = useMemo(() => {
    const selected = rules.filter((rule) => selectedComboRuleIds.includes(rule.id));
    return selected.length ? selected : rules.filter((rule) => canRuleParticipateInReference(rule, ruleValidationById.get(rule.id))).slice(0, 6);
  }, [rules, ruleValidationById, selectedComboRuleIds]);
  const manualComboReport = useMemo(() => {
    if (activeView !== "candidate-pool" || candidateWorkspaceTab !== "combo" || !isCandidatePoolReady) return EMPTY_CANDIDATE_REPORT;
    return generateCandidatePool({ draws: researchDraws, rules: manualComboRules, config, backtest: candidateBacktest, validationSummaries: ruleValidationSummaries });
  }, [activeView, candidateWorkspaceTab, isCandidatePoolReady, researchDraws, manualComboRules, config, candidateBacktest, ruleValidationSummaries]);
  const manualDrawValidation = useMemo(() => {
    const values = MANUAL_DRAW_KEYS.map((key) => ({ key, value: Number(manualDraw[key]) }));
    const invalidKeys = new Set<ManualDrawKey>();
    const errors: string[] = [];

    values.forEach(({ key, value }) => {
      if (!Number.isInteger(value) || value < 1 || value > 49) {
        invalidKeys.add(key);
      }
    });
    if (invalidKeys.size) errors.push("号码必须是 1-49 的整数");

    const seen = new Map<number, ManualDrawKey[]>();
    values.forEach(({ key, value }) => {
      if (!Number.isInteger(value) || value < 1 || value > 49) return;
      seen.set(value, [...(seen.get(value) ?? []), key]);
    });
    const duplicatedValues = [...seen.entries()].filter(([, keys]) => keys.length > 1).map(([value]) => value);
    if (duplicatedValues.length) errors.push(`重复号码：${duplicatedValues.map((value) => padNumber(value)).join("、")}`);

    return { errors, invalidKeys, duplicatedValues, valid: errors.length === 0 };
  }, [manualDraw]);
  const selectedOneClickDraw = oneClickMode === "manual" ? manualDraw : (latestRawDraw ?? manualDraw);
  const selectedOneClickPeriodIndex = useMemo(() => {
    const index = activeDraws.findIndex((draw) => draw.issue === selectedOneClickDraw.issue);
    return index >= 0 ? index : latestPeriodIndex;
  }, [activeDraws, latestPeriodIndex, selectedOneClickDraw.issue]);
  const oneClickResults = useMemo(() => {
    if (activeView !== "one-click" || !isOneClickReady) return [];
    if (oneClickMode === "manual" && !manualDrawValidation.valid) return [];
    return buildOneClickFormulaResults({ draw: selectedOneClickDraw, rules, config, periodIndex: selectedOneClickPeriodIndex });
  }, [activeView, config, isOneClickReady, manualDrawValidation.valid, oneClickMode, rules, selectedOneClickDraw, selectedOneClickPeriodIndex]);
  const oneClickPageSize = 10;
  const oneClickPageCount = Math.max(1, Math.ceil(oneClickResults.length / oneClickPageSize));
  const safeOneClickPage = Math.min(oneClickPage, oneClickPageCount - 1);
  const pagedOneClickResults = oneClickResults.slice(safeOneClickPage * oneClickPageSize, (safeOneClickPage + 1) * oneClickPageSize);
  const selectedRuleLedger = useMemo(() => {
    if (activeView !== "formula-detail" || !selectedRuleResult) return undefined;
    return buildFormulaLedger(selectedRuleResult, { draws: activeDraws, config });
  }, [activeView, selectedRuleResult, activeDraws, config]);
  const selectedRuleValidation = selectedRule ? ruleValidationById.get(selectedRule.id) : undefined;
  const discoveryRequestKey = useMemo(() => `${discoveryDepth}|${activeDraws.length}|${activeDraws.at(-1)?.issue ?? ""}|${JSON.stringify(config)}|${discoveryRefreshId}`, [activeDraws, config, discoveryDepth, discoveryRefreshId]);
  const cachedDiscoveryCandidates = formulaDiscoveryCache.get(discoveryRequestKey);
  const discoveryCandidates = useMemo(
    () => discoveryResult.key === discoveryRequestKey ? discoveryResult.candidates : cachedDiscoveryCandidates ?? [],
    [cachedDiscoveryCandidates, discoveryRequestKey, discoveryResult],
  );
  const discoveryLoading = activeView === "formula-discovery" && isFormulaDiscoveryReady && !cachedDiscoveryCandidates && discoveryResult.key !== discoveryRequestKey;

  useEffect(() => {
    if (!discoveryLoading) return undefined;
    const startedAt = performance.now();
    const updateElapsed = () => setDiscoveryElapsedSeconds(Math.max(1, Math.round((performance.now() - startedAt) / 1000)));
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [discoveryLoading, discoveryRequestKey]);

  useEffect(() => {
    if (activeView !== "formula-discovery" || !isFormulaDiscoveryReady) return;
    const cached = formulaDiscoveryCache.get(discoveryRequestKey);
    if (cached) return;
    let cancelled = false;
    const worker = new Worker(new URL("../workers/formula-discovery.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ ok: boolean; candidates?: FormulaDiscoveryCandidate[]; error?: string }>) => {
      if (cancelled) return;
      if (event.data.ok) {
        const candidates = event.data.candidates ?? [];
        formulaDiscoveryCache.set(discoveryRequestKey, candidates);
        while (formulaDiscoveryCache.size > FORMULA_DISCOVERY_CACHE_LIMIT) {
          const oldestKey = formulaDiscoveryCache.keys().next().value;
          if (typeof oldestKey !== "string") break;
          formulaDiscoveryCache.delete(oldestKey);
        }
        setDiscoveryResult({ key: discoveryRequestKey, candidates });
        setDiscoveryStatus(`筛选完成：生成 ${candidates.length} 条候选。`);
      }
      else setDiscoveryStatus(`筛选失败：${event.data.error ?? "计算出现异常"}`);
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (cancelled) return;
      setDiscoveryStatus(`筛选失败：${event.message || "筛选暂时无法启动"}`);
      setDiscoveryResult({ key: discoveryRequestKey, candidates: [] });
      worker.terminate();
    };
    worker.postMessage({ draws: activeDraws, config, depth: discoveryDepth });
    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, [activeView, isFormulaDiscoveryReady, activeDraws, config, discoveryDepth, discoveryRequestKey]);
  const focusedDiscoveryCandidate = useMemo(() => {
    if (activeView !== "formula-discovery") return undefined;
    return discoveryCandidates.find((candidate) => candidate.rule.id === discoveryFocusId) ?? discoveryCandidates[0];
  }, [activeView, discoveryCandidates, discoveryFocusId]);
  const focusedDiscoveryExistingRule = useMemo(() => {
    if (!focusedDiscoveryCandidate) return undefined;
    const signature = buildRuleSignature(focusedDiscoveryCandidate.rule);
    return rules.find((rule) => buildRuleSignature(rule) === signature);
  }, [focusedDiscoveryCandidate, rules]);
  const focusedCandidate = useMemo<CandidateNumber | CandidateZodiac | undefined>(() => {
    if (activeView !== "candidate-pool") return undefined;
    if (candidateFocus?.type === "number") return candidateReport.allNumbers.find((item) => item.number === candidateFocus.value);
    if (candidateFocus?.type === "zodiac") return candidateReport.allZodiacs.find((item) => item.zodiac === candidateFocus.value);
    if (candidateTab.startsWith("zodiacs")) return candidateReport.topZodiacs9[0];
    return candidateReport.topNumbers8[0] ?? candidateReport.topNumbers18[0];
  }, [activeView, candidateFocus, candidateReport, candidateTab]);

  const drawColumns: ColumnDef<ReturnType<typeof normalizeDraw>>[] = [
    {
      accessorKey: "issue",
      header: "期号",
      cell: ({ row }) => <span className="rq-draw-issue">{row.original.issue}</span>,
    },
    { header: "来源", cell: ({ row }) => isManualDrawRecord(row.original) ? <Badge tone="cyan">人工录入</Badge> : <Badge tone={row.original.sourceUrl ? "green" : "slate"}>{row.original.sourceUrl ? "网站/云端" : "本地"}</Badge> },
    {
      accessorKey: "date",
      header: "日期",
      cell: ({ row }) => {
        const [year = "-", month = "", day = ""] = String(row.original.date ?? "-").split("-");
        return (
          <span className="rq-draw-date">
            <strong>{year}</strong>
            <small>{month && day ? `${month}-${day}` : ""}</small>
          </span>
        );
      },
    },
    { header: "L序", cell: ({ row }) => codeValue(row.original.lOrder.map((n) => numberWithZodiac(n, config)).join(" ")) },
    { header: "D序", cell: ({ row }) => codeValue(row.original.dOrder.map((n) => numberWithZodiac(n, config)).join(" ")) },
    { header: "特码", cell: ({ row }) => <Badge tone="cyan">{numberWithZodiac(row.original.special, config)}</Badge> },
    { header: "特码属性", cell: ({ row }) => `${row.original.specialAttributes.zodiac} / ${row.original.specialAttributes.color} / ${row.original.specialAttributes.element}` },
    { header: "总数", cell: ({ row }) => codeValue(row.original.total) },
  ];

  const detailColumns: ColumnDef<BacktestDetail>[] = [
    { accessorKey: "currentIssue", header: "当前期" },
    { accessorKey: "nextIssue", header: "下期" },
    { header: "raw", cell: ({ row }) => codeValue(row.original.rawResult) },
    { header: "输出", cell: ({ row }) => row.original.mappedResult.join("、") },
    { accessorKey: "targetLabel", header: "对象 / 集合" },
    { header: "结果", cell: ({ row }) => <Badge tone={row.original.success ? "green" : "rose"}>{row.original.success ? "通过" : "失败"}</Badge> },
  ];

  const fetchSourceDraws = useCallback(async (syncPreview = true, saveMode: "none" | "merge" | "replace" = "replace") => {
    const isBackgroundCheck = !syncPreview && saveMode === "none";
    if (!isBackgroundCheck) {
      setSourceLoading(true);
      setSourceStatus("正在同步配置的开奖源数据，请稍候...");
    }
    try {
      const isGithubPagesHost = typeof window !== "undefined" && (window.location.hostname.endsWith("github.io") || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true");
      const endpoint = "/api/import-draws-from-url";
      const fallbackEndpoint = REMOTE_DRAW_IMPORT_ENDPOINT;
      const payload = {
        baseUrl: sourceUrl,
        fromYear: Number(sourceFromYear),
        toYear: Number(sourceToYear),
        persist: false,
      };
      const request = async (url: string) => {
        const response = await fetchWithTimeout(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        }, 10000);
        const data = (await response.json()) as UrlImportResponse;
        if (!response.ok) throw new Error(data.errors?.[0] ?? "网址数据抓取失败");
        return data;
      };
      const requestStaticSnapshot = async () => {
        let lastError = "";
        for (const url of staticCloudStateUrls()) {
          try {
            const response = await fetchWithTimeout(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" }, 8000);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const state = (await response.json()) as { draws?: DrawRecord[]; meta?: UrlImportResponse["state"] };
            if (!Array.isArray(state.draws) || !state.draws.length) throw new Error("static snapshot missing draws");
            return {
              records: state.draws,
              years: [{ year: Number(sourceFromYear), url, count: state.draws.length }],
              errors: [],
              fetchedAt: state.meta?.updatedAt,
              latestIssue: state.meta?.latestIssue,
              recordCount: state.meta?.recordCount ?? state.draws.length,
              state: state.meta,
            } satisfies UrlImportResponse;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
        }
        throw new Error(`Static draw snapshot unavailable: ${lastError || "unknown error"}`);
      };

      let data: UrlImportResponse;
      if (isGithubPagesHost) {
        data = await requestStaticSnapshot();
      } else try {
        data = await request(endpoint);
      } catch (primaryError) {
        if (fallbackEndpoint.startsWith("/")) {
          throw primaryError;
        } else {
          data = await request(fallbackEndpoint);
        }
      }

      if (!(data.records?.length) && !isGithubPagesHost) {
        try {
          const snapshot = await requestStaticSnapshot();
          data = {
            ...snapshot,
            errors: [...(data.errors ?? []), "实时开奖源暂时不可用，已自动使用最近一次完整网站快照。"],
          };
        } catch {
          // The original error below keeps the current local library intact.
        }
      }

      const fetchedRecords = data.records ?? [];
      if (!fetchedRecords.length) {
        throw new Error("网站本次没有返回有效开奖记录，已保留现有开奖库");
      }
      const fetchedSorted = sortDrawRecords(fetchedRecords);
      const latestFetched = fetchedSorted.at(-1);
      const currentLatest = sortDrawRecords(activeDraws).at(-1);
      const latestFetchedValue = Number(latestFetched?.issue ?? 0);
      const currentLatestValue = Number(currentLatest?.issue ?? 0);
      const hasNewWebsiteDraw = Number.isFinite(latestFetchedValue)
        && latestFetchedValue > 0
        && (!Number.isFinite(currentLatestValue) || latestFetchedValue > currentLatestValue);
      const syncedAt = new Date().toLocaleString("zh-CN", { hour12: false });
      setLastSyncAt(syncedAt);
      localStorage.setItem("rulequant:lastSyncAt", syncedAt);
      localStorage.setItem("rulequant:lastSyncedIssue", latestFetched?.issue ?? "");
      const nextSummaries = data.years ?? [];
      setSourceRecords(fetchedRecords);
      setSourceSummaries(nextSummaries);
      setImportErrors(data.errors ?? []);
      if (syncPreview) setPreviewDraws(fetchedRecords);
      if (saveMode === "replace") {
        await store.replaceDraws(fetchedRecords);
      } else if (saveMode === "merge") {
        await store.importDraws(fetchedRecords);
      } else if (hasNewWebsiteDraw) {
        // A background check must promote a newly published issue into the
        // calculation library. Otherwise the status can say "latest" while
        // Formula Engine is still reading yesterday's persisted snapshot.
        await store.replaceDraws(fetchedRecords);
      }
      // The automatic foreground check only needs the fetched snapshot. Rehydrating the
      // complete store here repeats IndexedDB and cloud reads and keeps every page in a
      // misleading "syncing" state for several seconds. Explicit sync actions still
      // rehydrate after replacing or merging the draw library.
      if (data.state?.latestIssue && saveMode !== "none") {
        await store.hydrate();
      }
      clearCandidatePoolCache();
      setReferenceRunId((current) => current + 1);
      const changed = hasNewWebsiteDraw;
      const usedSnapshotFallback = data.errors?.some((message) => message.includes("备用") || message.includes("快照"));
      const nextSourceStatus = (
        usedSnapshotFallback
          ? `实时开奖源暂时不可用，已使用备用快照 ${latestFetched?.issue ?? "-"} 期，共 ${fetchedRecords.length} 条记录；现有数据未丢失。`
          : changed
          ? `已同步到最新 ${latestFetched?.issue ?? "-"} 期，共 ${fetchedRecords.length} 条记录，页面已重新计算。`
          : `已检查配置的开奖源，当前仍为 ${latestFetched?.issue ?? "-"} 期，共 ${fetchedRecords.length} 条记录。`
      );
      sourceSessionSnapshot = { records: fetchedRecords, summaries: nextSummaries, status: nextSourceStatus };
      setSourceStatus(nextSourceStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportErrors([message]);
      setSourceStatus(`同步失败：${message}`);
    } finally {
      if (!isBackgroundCheck) setSourceLoading(false);
    }
  }, [activeDraws, sourceUrl, sourceFromYear, sourceToYear, store]);

  useEffect(() => {
    if (!hasHydrated || sourceLoading || !WEBSITE_FIRST_VIEWS.has(activeView)) return;

    const syncLatest = (force = false) => {
      const now = Date.now();
      const minimumGap = force ? RESUME_SYNC_INTERVAL_MS : AUTO_SYNC_INTERVAL_MS;
      if (now - lastAutomaticSourceCheckAt < minimumGap) return;
      lastAutomaticSourceCheckAt = now;
      void fetchSourceDraws(false, "none");
    };

    const syncAfterResume = () => syncLatest(true);
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncLatest(true);
    };

    queueMicrotask(() => syncLatest(false));
    const timer = window.setInterval(() => syncLatest(), AUTO_SYNC_INTERVAL_MS);
    window.addEventListener("pageshow", syncAfterResume);
    window.addEventListener("focus", syncAfterResume);
    window.addEventListener("online", syncAfterResume);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pageshow", syncAfterResume);
      window.removeEventListener("focus", syncAfterResume);
      window.removeEventListener("online", syncAfterResume);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [activeView, fetchSourceDraws, hasHydrated, sourceLoading]);

  async function handleParseImport() {
    const result = parseDrawText(importText);
    setPreviewDraws(result.records);
    setImportErrors(result.errors);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    const result = await parseDrawFile(file);
    setPreviewDraws(result.records);
    setImportErrors(result.errors);
  }

  async function handleRuleLibraryFile(file?: File) {
    if (!file) return;
    setRuleLibraryStatus("");
    try {
      if (file.size > MAX_RULE_LIBRARY_FILE_BYTES) {
        setRuleLibraryStatus("导入失败：公式文件超过5MB，请拆分后重试。");
        return;
      }
      const text = await file.text();
      if (/\.txt$/i.test(file.name) || file.type === "text/plain") {
        const result = parseRuleTextFile(text, file.name);
        if (!result.rules.length) {
          setRuleLibraryStatus(`TXT 公式识别失败：${result.errors.join("；") || "未识别到公式"}`);
          return;
        }
        const libraryResult = await store.addRulesToLibrary(
          result.rules.map((rule) => ({ ...rule, sourceType: "txt_import" as const, origin: file.name, fromTextId: file.name })),
          `TXT 导入公式：${file.name}`,
        );
        const warningText = result.warnings.length ? ` 提醒：${result.warnings.join("；")}` : "";
        setRuleLibraryStatus(`TXT 规则入库完成：新增 ${libraryResult.added.length} 条，重复 ${libraryResult.duplicates.length} 条，失败 ${libraryResult.failed.length} 条。${warningText}`);
        return;
      }

      const parsed = JSON.parse(text) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { rules?: unknown }).rules)
          ? (parsed as { rules: unknown[] }).rules
          : [];
      const validRules = records.filter((item): item is RuleRecord => {
        if (!item || typeof item !== "object") return false;
        const rule = item as Partial<RuleRecord>;
        return Boolean(rule.id && rule.name && rule.category && rule.orderMode && rule.formula);
      });
      if (!validRules.length) {
        setRuleLibraryStatus("导入失败：JSON 里没有识别到有效公式。");
        return;
      }
      await store.importRules(validRules);
      setRuleLibraryStatus(`已导入 ${validRules.length} 条公式。`);
    } catch (error) {
      setRuleLibraryStatus(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleImportPreview() {
    await store.importDraws(previewDraws);
    setPreviewDraws([]);
    setImportText("");
  }

  async function replaceLocalDrawsWithSourceRecords() {
    if (!sourceRecords.length) {
      setSourceStatus("暂无可替换的网站开奖记录，已保留现有开奖库");
      return;
    }
    await store.replaceDraws(sourceRecords);
    const syncedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    setLastSyncAt(syncedAt);
    localStorage.setItem("rulequant:lastSyncAt", syncedAt);
    setSourceStatus(`已用网址 ${sourceRecords.length} 条记录替换本地开奖库`);
  }

  function buildManualDrawRecord(): DrawRecord {
    const now = new Date();
    const issueInput = String(manualDraw.issue || "").trim();
    const issue = !issueInput || issueInput.toLowerCase() === "manual" ? `manual-${now.toISOString().slice(0, 19).replace(/[-:T]/g, "")}` : issueInput;
    return {
      ...manualDraw,
      issue,
      date: manualDraw.date || now.toISOString().slice(0, 10),
      year: manualDraw.year ?? now.getFullYear(),
      sourceUrl: "manual://user-input",
      rawAttributes: {
        ...(manualDraw.rawAttributes ?? {}),
        sourceType: "manual",
        label: "人工录入",
        note: "一键算公式页面手动输入保存",
        savedAt: now.toISOString(),
      },
    };
  }

  async function saveManualDraw() {
    const record = buildManualDrawRecord();
    const numbers = [record.n1, record.n2, record.n3, record.n4, record.n5, record.n6, record.special];
    if (!manualDrawValidation.valid) {
      setOneClickStatus(`保存失败：${manualDrawValidation.errors.join("；")}`);
      return;
    }
    const hasInvalidNumber = numbers.some((value) => !Number.isInteger(value) || value < 1 || value > 49);
    if (hasInvalidNumber) {
      setOneClickStatus("保存失败：开奖号码必须是 1-49 的整数。");
      return;
    }

    await store.importDraws([record]);
    setManualDraw(record);
    clearCandidatePoolCache();
    setReferenceRunId((current) => current + 1);
    const savedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    setLastSyncAt(savedAt);
    localStorage.setItem("rulequant:lastSyncAt", savedAt);
    setSourceStatus(`已保存人工录入开奖：${record.issue}，${drawNumbersWithZodiac(record, config)}。开奖数据页顶部会单独显示。`);
    setOneClickStatus(`已保存人工录入开奖 ${record.issue}，后续计算会标记为人工数据；可在“开奖数据”页顶部查看。`);
    await store.addOperationLog({
      type: "sync_draws",
      message: `人工录入开奖：${record.issue}`,
      issue: record.issue,
      dataCount: activeDraws.length + 1,
      details: {
        sourceType: "manual",
        numbers,
      },
    });
  }

  async function deleteManualDraw(issue: string) {
    if (!window.confirm(`确认删除人工录入开奖「${issue}」吗？删除后不再参与计算。`)) return;
    await store.deleteDraw(issue);
    setSourceRecords((current) => current.filter((record) => !(record.issue === issue && isManualDrawRecord(record))));
    clearCandidatePoolCache();
    setReferenceRunId((current) => current + 1);
    setSourceStatus(`已删除人工录入开奖：${issue}。`);
    setOneClickStatus(`已删除人工录入开奖 ${issue}，后续计算不会再使用这条人工数据。`);
  }

  function handleOneClickCalculate() {
    if (oneClickMode === "manual" && !manualDrawValidation.valid) {
      setOneClickStatus(`计算失败：${manualDrawValidation.errors.join("；")}`);
      return;
    }
    setOneClickCalculating(true);
    setOneClickStatus("正在计算全部启用公式...");
    window.setTimeout(() => {
      const now = new Date().toLocaleString("zh-CN", { hour12: false });
      setLastCalculationAt(now);
      localStorage.setItem("rulequant:lastCalculationAt", now);
      setOneClickStatus(`已计算 ${oneClickResults.length} 条公式，使用期号 ${selectedOneClickDraw.issue}。`);
      setOneClickCalculating(false);
      void store.addOperationLog({
        type: "one_click_calculate",
        message: `一键计算全部公式：启用 ${enabledRuleCount} 条，可参与 ${referenceRuleCount} 条`,
        issue: selectedOneClickDraw.issue,
        dataCount: activeDraws.length,
        formulaCount: referenceRuleCount,
      });
    }, 0);
  }

  async function saveReferenceReport(report: CandidatePoolReport, saveType: "auto" | "manual", note?: string) {
    if (!report.ruleCount || !report.signalCount) {
      setReferenceStatus("当前没有可保存的综合推荐记录：公式依据为空。");
      return;
    }
    const record = buildReferenceHistoryItem({
      report,
      saveType,
      dataSourceLabel,
      recordCount: activeDraws.length,
      note,
    });
    await store.saveReferenceHistory(record);
    setReferenceStatus(`已保存 ${record.baseIssue ?? "-"} 期综合推荐档案：Top8/12/16/18、全量49号码、生肖Top7/8/9、全量12生肖和证据摘要都已入库。`);
  }

  async function saveReferenceArchiveForIssue(issue: string) {
    const targetIssue = issue.trim();
    if (!targetIssue) {
      setReferenceStatus("请选择要复盘保存的基准期号。");
      return;
    }
    const sorted = sortDrawRecords(activeDraws);
    const targetIndex = sorted.findIndex((draw) => draw.issue === targetIssue);
    if (targetIndex < 1) {
      setReferenceStatus("这个期号前面的历史数据不足，无法生成历史预测复盘。");
      return;
    }

    setReferenceArchiveSaving(true);
    setReferenceStatus(`正在复盘 ${targetIssue} 期及以前的数据…`);
    try {
      const archiveDraws = sorted.slice(0, targetIndex + 1);
      const archiveReport = await runCandidateReportWorker({
        draws: archiveDraws,
        rules,
        config,
        validationSummaries: ruleValidationSummaries,
      });

      if (!archiveReport.ruleCount || !archiveReport.signalCount) {
        setReferenceStatus("这期没有生成可保存的公式依据，请检查公式是否启用且可计算。");
        return;
      }

      const record = buildReferenceHistoryItem({
        report: archiveReport,
        saveType: "manual",
        dataSourceLabel,
        recordCount: archiveDraws.length,
        note: `历史复盘：按 ${archiveReport.latestIssue ?? targetIssue} 期及以前数据生成`,
      });
      await store.saveReferenceHistory(record);
      await store.addOperationLog({
        type: "generate_reference",
        message: `历史复盘保存：${record.baseIssue ?? targetIssue} 期，${record.ruleCount} 条公式，${record.signalCount} 条依据`,
        issue: record.baseIssue ?? targetIssue,
        dataCount: archiveDraws.length,
        formulaCount: record.ruleCount,
        signalCount: record.signalCount,
      });
      setReferenceStatus(`已保存 ${record.baseIssue ?? targetIssue} 期历史预测复盘；如果下一期已开奖，档案会自动对比命中情况。`);
    } catch (error) {
      setReferenceStatus(`历史复盘失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setReferenceArchiveSaving(false);
    }
  }

  async function handleRegenerateReference() {
    if (!backgroundBacktest) {
      setReferenceStatus("历史表现仍在整理，请稍候再重新生成。");
      return;
    }
    setReferenceCalculating(true);
    setReferenceStatus("正在重新计算公式依据与候选排序…");
    try {
      clearCandidatePoolCache();
      candidatePoolReportCache.clear();
      const nextRunId = referenceRunId + 1;
      const nextReportKey = `${backgroundBacktestKey}:${nextRunId}`;
      const freshReport = await runCandidateReportWorker({
        draws: researchDraws,
        rules,
        config,
        backtest: compactCandidateBacktest(candidateBacktest),
        validationSummaries: ruleValidationSummaries,
      });
      candidatePoolReportCache.set(nextReportKey, freshReport);
      startTransition(() => {
        setCandidateReportState({ key: nextReportKey, report: freshReport, loading: false, error: "" });
        setReferenceRunId(nextRunId);
      });
      const generatedAt = new Date().toISOString();
      const calculatedAt = new Date(generatedAt).toLocaleString("zh-CN", { hour12: false });
      setReferenceGeneratedAt(generatedAt);
      setLastCalculationAt(calculatedAt);
      localStorage.setItem("rulequant:lastCalculationAt", calculatedAt);
      void store.addOperationLog({
        type: "generate_reference",
        message: `重新生成综合参考结果：${freshReport.ruleCount} 条公式参与，生成 ${freshReport.signalCount} 条依据`,
        issue: freshReport.latestIssue,
        dataCount: activeDraws.length,
        formulaCount: freshReport.ruleCount,
        signalCount: freshReport.signalCount,
        details: {
          latestNumbers: freshReport.latestNumbers,
          excludedRuleCount,
          exceptionRuleCount: exceptionRules.length,
        },
      });
      setCandidateFocus(null);
      setReferenceStatus(`已使用 ${freshReport.latestIssue ?? "-"} 期数据，${freshReport.ruleCount} 条公式参与计算，生成 ${freshReport.signalCount} 条公式依据。`);
    } catch (error) {
      setReferenceStatus(`重新生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setReferenceCalculating(false);
    }
  }

  function updateManualDraw(key: keyof DrawRecord, value: string) {
    setOneClickMode("manual");
    setManualDraw((current) => ({
      ...current,
      [key]: key === "issue" || key === "date" || key === "sourceUrl" ? value : Number(value || 0),
    }));
  }

  function repairManualDrawNumber(key: ManualDrawKey) {
    setManualDraw((current) => ({
      ...current,
      [key]: normalizeManualDrawNumber(current[key]),
    }));
  }

  function stepManualDrawNumber(key: ManualDrawKey, step: number) {
    setOneClickMode("manual");
    setManualDraw((current) => ({
      ...current,
      [key]: normalizeManualDrawNumber(Number(current[key]) + step),
    }));
  }

  async function addDiscoveredRule(rule: RuleRecord) {
    setDiscoveryStatus("");
    const now = new Date().toISOString();
    const result = await store.addRuleToLibrary({
      ...rule,
      id: undefined,
      enabled: true,
      manuallyConfirmed: true,
      participatesInReference: true,
      sourceType: "system_recommended",
      origin: "公式筛选",
      fromCandidateId: rule.id,
      parseStatus: "parsed",
      verifyStatus: "unchecked",
      name: `${rule.name}（已加入）`,
      createdAt: now,
      updatedAt: now,
    }, "确认系统推荐公式");
    if (result.ok) {
      setDiscoveryFocusId(rule.id);
      setDiscoveryStatus(`已加入公式库：${result.rule.name}`);
    } else if (result.duplicate) {
      store.setSelectedRule(result.duplicate.id);
      setDiscoveryStatus(`这条公式已在公式库中：${result.duplicate.name}`);
    } else {
      setDiscoveryStatus(`加入失败：${result.reason}`);
    }
  }

  async function saveRuleFromForm(formData: FormData): Promise<RuleSaveResult> {
    const rawId = String(formData.get("id") || "");
    const existingRule = rawId ? rules.find((rule) => rule.id === rawId) : undefined;
    const rule = buildRuleFromFormData(formData, { existingRule, forceNew: !existingRule });
    const drawForValidation = latestDraw ?? normalizedDraws[0];
    if (drawForValidation) {
      try {
        runRuleCalculation(rule, drawForValidation, config, { periodIndex: latestDraw ? latestPeriodIndex : 0 });
      } catch (error) {
        return { ok: false, message: `公式暂不能保存：${error instanceof Error ? error.message : String(error)}` };
      }
    }
    const result = await store.upsertRule(rule);
    if (!result.ok) {
      if (result.duplicate) {
        store.setSelectedRule(result.duplicate.id);
        setRuleFilter("all");
        setRuleLibraryFilter("all");
        return { ok: false, message: `这条规则已存在于公式库：${result.duplicate.name}`, duplicate: result.duplicate };
      }
      return { ok: false, message: `保存失败：${result.reason}` };
    }
    store.setSelectedRule(result.rule.id);
    setRuleFilter("all");
    setRuleLibraryFilter("all");
    setRuleSort("smart");
    clearCandidatePoolCache();
    setReferenceRunId((current) => current + 1);
    return { ok: true, rule: result.rule, message: `${result.message}：${result.rule.name}。公式管理默认会显示全部公式。` };
  }

  async function saveSample() {
    const mapped = sampleDraft.expectedMappedResult
      .split(/[,，、\s]+/)
      .filter(Boolean)
      .map((item) => (Number.isFinite(Number(item)) ? Number(item) : item));
    const sample: SampleCase = {
      id: `sample-${Date.now()}`,
      ruleId: sampleDraft.ruleId,
      issue: sampleDraft.issue,
      expectedRawResult: sampleDraft.expectedRawResult ? Number(sampleDraft.expectedRawResult) : undefined,
      expectedFinalResult: sampleDraft.expectedFinalResult ? Number(sampleDraft.expectedFinalResult) : undefined,
      expectedMappedResult: mapped.length ? mapped : undefined,
      expectedSuccess: sampleDraft.expectedSuccess === "true",
      sourceFile: "手动录入",
    };
    await store.upsertSample(sample);
  }

  if (!hasHydrated) {
    return (
      <div className="rq-shell grid min-h-screen place-items-center px-5 text-slate-100">
        <div className="rq-hydration-panel w-full max-w-md rounded-2xl border p-6 text-center">
          <Activity className="mx-auto h-7 w-7 animate-pulse text-cyan-300" />
          <h1 className="mt-4 text-lg font-semibold text-white">正在恢复 RuleQuant 数据</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">正在合并本机公式、人工开奖和最新共享数据，完成前不会写入或覆盖公式库。</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rq-shell overflow-x-hidden text-slate-100"
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
        if (!anchor || anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const nextUrl = new URL(anchor.href, window.location.href);
        if (nextUrl.origin === window.location.origin && nextUrl.pathname !== window.location.pathname) setPendingRoute(nextUrl.pathname);
      }}
    >
      {pendingRoute && <div className="rq-route-progress" role="status" aria-label="正在打开页面"><span /></div>}
      <div className="rq-shell-grid relative z-10 grid grid-cols-1 lg:grid-cols-[228px_1fr]">
        <aside className="rq-sidebar sticky top-0 hidden h-[calc(100vh-24px)] border-r p-4 lg:block">
          <Link href="/dashboard" className="rq-brand mb-6 flex items-center gap-3 rounded-xl border p-3">
            <div className="rq-brand__icon flex h-10 w-10 items-center justify-center rounded-xl">
              <Braces className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-white">RuleQuant</div>
              <div className="text-xs text-slate-500">规则回测终端</div>
            </div>
          </Link>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeView;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn("rq-nav-item flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition", active && "rq-nav-item--active")}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {mobileMoreOpen && typeof document !== "undefined" && createPortal(
          <div className="rq-mobile-more-layer lg:hidden">
            <button
              type="button"
              className="rq-mobile-more-backdrop"
              aria-label="关闭更多功能"
              onClick={() => setMobileMoreOpen(false)}
            />
            <div className="rq-mobile-more" role="dialog" aria-modal="true" aria-label="更多功能">
              <div className="rq-mobile-more__handle" aria-hidden="true" />
              <div className="rq-mobile-more__head">
                <div><strong>更多功能</strong><small>数据、校验、筛选与设置</small></div>
                <button ref={mobileMoreCloseRef} type="button" className="rq-mobile-more__close" aria-label="收起更多功能" onClick={() => setMobileMoreOpen(false)}><ChevronDown className="h-5 w-5" /></button>
              </div>
              <div className="rq-mobile-more__grid">
                {mobileMoreItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.key === activeView;
                  return (
                    <Link key={item.key} href={item.href} onClick={() => setMobileMoreOpen(false)} className={cn("rq-mobile-more__item", active && "is-active")}>
                      <span className="rq-mobile-more__icon"><Icon className="h-5 w-5" /></span>
                      <span>{item.label}</span>
                      <ChevronRight className="rq-mobile-more__chevron h-4 w-4" aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}

        <nav className={cn("rq-mobile-nav fixed inset-x-0 bottom-0 z-50 w-screen max-w-[100vw] border-t px-2 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 lg:hidden", mobileNavCompact && "rq-mobile-nav--compact", mobileMoreOpen && "is-more-open")}>
          <div className="rq-mobile-nav__grid grid min-w-0 gap-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeView;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "rq-nav-item flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs leading-none transition",
                    active && "rq-nav-item--active",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="max-w-full">{item.key === "candidate-pool" ? "综合结果" : item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              className={cn("rq-nav-item flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs leading-none transition", (mobileMoreOpen || !mobileNavKeys.includes(activeView)) && "rq-nav-item--active")}
              aria-expanded={mobileMoreOpen}
              aria-label="更多功能"
              onClick={() => setMobileMoreOpen((current) => !current)}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>更多</span>
            </button>
          </div>
        </nav>

        <main className="min-w-0 max-w-full overflow-x-hidden pb-[calc(104px+env(safe-area-inset-bottom))] lg:pb-0">
          <header className="rq-topbar sticky top-0 z-20 border-b px-4 py-3 sm:px-6 sm:py-4">
            <div className="rq-topbar-inner">
              <div className="rq-topbar-title min-w-0">
                <p className="rq-page-kicker text-xs font-medium">开奖数据 · 公式计算 · 综合参考</p>
                <h1 className="rq-page-title mt-1 break-words text-[22px] font-semibold leading-tight sm:text-[28px]">{viewLabels[activeView]}</h1>
              </div>
              <div className="rq-topbar-overview" aria-label="当前运行概况">
                <span><Database className="h-4 w-4" /><small>数据</small><b>{sourceRecords.length || activeDraws.length} 期</b></span>
                <span><Layers3 className="h-4 w-4" /><small>公式</small><b>{calculableRuleCount} 条</b></span>
                <span><Activity className="h-4 w-4" /><small>依据</small><b>{isCandidateReferencePreparing ? "整理中" : `${candidateReport.signalCount} 条`}</b></span>
              </div>
              <div className="rq-topbar-actions flex min-w-0 max-w-full flex-wrap items-center gap-2 text-xs text-slate-400">
                <Badge tone={hasSharedDraws ? "green" : "slate"}>{dataSourceLabel}</Badge>
                <span className="shrink-0">最新期：{latestRawDraw?.issue ?? "-"}</span>
                <ThemeToggle />
                {showCloudPublishControls && cloudPublishStatus === "failed" && cloudPublishMessage && <Badge tone="rose">{cloudPublishMessage}</Badge>}
              </div>
            </div>
          </header>

          <div className="rq-content rq-view-enter mx-auto w-full max-w-[1720px] p-3 sm:p-5 lg:p-6">
            {!(["rules", "dashboard", "candidate-pool"] as ViewKey[]).includes(activeView) && (isBackgroundBacktestCalculating || backgroundBacktestError) && (
              <div className={cn("rq-analysis-status mb-4", isBackgroundBacktestCalculating && "is-loading", backgroundBacktestError && "is-error")} role="status" aria-live="polite">
                {isBackgroundBacktestCalculating ? (
                  <><span className="rq-progress-spinner" aria-hidden="true" /><div><strong>页面已打开，正在整理公式数据</strong><small>页面可以继续操作，历史表现和综合依据完成后会自动显示。</small></div></>
                ) : (
                  <><XCircle className="h-5 w-5" /><div><strong>公式数据暂未完成</strong><small>{backgroundBacktestError}</small></div></>
                )}
              </div>
            )}
            {activeView === "dashboard" && (
              <div className="space-y-4">
                <section className="rq-dashboard-intro">
                  <div className="rq-dashboard-intro__heading">
                    <span className="rq-dashboard-intro__eyebrow"><Activity className="h-4 w-4" />今日运行</span>
                    <h2 className="text-[24px] font-semibold leading-tight text-white sm:text-[30px]">今日公式计算</h2>
                    <div className="rq-dashboard-intro__status" aria-label="今日计算状态">
                      <span>最新期 {latestRawDraw?.issue ?? "-"}</span>
                      <span>{calculableRuleCount} 条公式可用</span>
                      <span>{isCandidateReferencePreparing ? "依据整理中" : `${candidateReport.signalCount} 条依据`}</span>
                    </div>
                  </div>
                  <div className="rq-workflow" aria-label="日常操作流程">
                    <button
                      type="button"
                      className={cn("rq-workflow-step", isUsingSyncedData && "is-complete")}
                      disabled={sourceLoading}
                      aria-busy={sourceLoading || undefined}
                      onClick={() => void fetchSourceDraws(true, "replace")}
                    >
                      <span className="rq-workflow-step__number">01</span>
                      <span className="rq-workflow-step__icon"><RefreshCw className={cn("h-4 w-4", sourceLoading && "animate-spin")} /></span>
                      <span className="rq-workflow-step__copy"><b>{sourceLoading ? "正在同步" : "同步数据"}</b><small>{isUsingSyncedData ? `已到 ${latestRawDraw?.issue ?? "最新一期"}` : "获取最新开奖"}</small></span>
                    </button>
                    <button
                      type="button"
                      className={cn("rq-workflow-step", lastCalculationAt && "is-complete")}
                      disabled={oneClickCalculating}
                      aria-busy={oneClickCalculating || undefined}
                      onClick={handleOneClickCalculate}
                    >
                      <span className="rq-workflow-step__number">02</span>
                      <span className="rq-workflow-step__icon"><Play className="h-4 w-4" /></span>
                      <span className="rq-workflow-step__copy"><b>{oneClickCalculating ? "正在计算" : "一键计算"}</b><small>{lastCalculationAt ? "本机已有结果" : "运行全部公式"}</small></span>
                    </button>
                    <Link href="/candidate-pool" className="rq-workflow-step rq-workflow-step--primary">
                      <span className="rq-workflow-step__number">03</span>
                      <span className="rq-workflow-step__icon"><Activity className="h-4 w-4" /></span>
                      <span className="rq-workflow-step__copy"><b>查看结果</b><small>{candidateReport.signalCount ? `${candidateReport.signalCount} 条依据` : "查看综合排序"}</small></span>
                    </Link>
                  </div>
                </section>

                <div className="rq-dashboard-metrics" aria-label="当前计算概况">
                  <div className="rq-dashboard-metric"><span className="rq-dashboard-metric__icon"><Database className="h-4 w-4" /></span><div><span>最新期号</span><strong>{latestRawDraw?.issue ?? "-"}</strong><small>{isUsingSyncedData ? "已使用最新同步数据" : "建议先同步"}</small></div></div>
                  <div className="rq-dashboard-metric"><span className="rq-dashboard-metric__icon"><TableProperties className="h-4 w-4" /></span><div><span>全年记录</span><strong>{sourceRecords.length || activeDraws.length}</strong><small>{dataSourceLabel}</small></div></div>
                  <div className="rq-dashboard-metric"><span className="rq-dashboard-metric__icon"><Layers3 className="h-4 w-4" /></span><div><span>参与公式</span><strong>{isCandidateReferencePreparing ? "整理中" : candidateReport.ruleCount}</strong><small>启用 {enabledRuleCount} · 可计算 {calculableRuleCount}</small></div></div>
                  <div className="rq-dashboard-metric"><span className="rq-dashboard-metric__icon"><Activity className="h-4 w-4" /></span><div><span>本期依据</span><strong>{isCandidateReferencePreparing ? "整理中" : candidateReport.signalCount}</strong><small>{isCandidateReferencePreparing ? "正在生成公式依据" : "结果生成所用依据"}</small></div></div>
                </div>

                <div className="rq-dashboard-main-grid grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_390px] 2xl:grid-cols-[minmax(0,1.55fr)_420px]">
                  <Panel className="rq-dashboard-result p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div><h3 className="font-semibold text-white">本期综合参考</h3><p className="mt-1 text-sm text-slate-500">由历史表现和最新一期公式输出共同生成，仅供公式研究。</p></div>
                      <Badge tone={candidateReport.signalCount ? "green" : "yellow"}>{isCandidateReferencePreparing ? "正在整理" : candidateReport.signalCount ? `已生成 ${candidateReport.signalCount} 条依据` : "等待生成"}</Badge>
                    </div>
                    <div className="mt-5">
                      <p className="mb-2 text-xs font-medium text-slate-500">重点号码 Top 8</p>
                      <div className="rq-top-number-grid">
                        {candidateReport.topNumbers8.length ? candidateReport.topNumbers8.map((item, index) => (
                          <Link key={item.number} href="/candidate-pool" className="rq-top-number"><small>{String(index + 1).padStart(2, "0")}</small><strong>{padNumber(item.number)}</strong><span>{item.zodiac}</span></Link>
                        )) : isCandidateReferencePreparing ? (
                          <>
                            <span className="sr-only" role="status">正在生成号码依据</span>
                            {Array.from({ length: 8 }, (_, index) => <span key={index} className="rq-top-number rq-skeleton-tile" aria-hidden="true"><i /><i /></span>)}
                          </>
                        ) : <span className="rq-inline-empty col-span-full">{candidateReportError || "暂无可用证据，请先同步并计算公式。"}</span>}
                      </div>
                    </div>
                    <div className="mt-5 border-t border-white/[0.08] pt-4">
                      <p className="mb-2 text-xs font-medium text-slate-500">参考生肖 Top 7</p>
                      <div className="rq-zodiac-row">
                        {candidateReport.topZodiacs7.length ? candidateReport.topZodiacs7.map((item, index) => <span key={item.zodiac}><small>{index + 1}</small><b>{item.zodiac}</b></span>) : isCandidateReferencePreparing ? (
                          <>
                            <span className="sr-only" role="status">正在整理生肖依据</span>
                            {Array.from({ length: 7 }, (_, index) => <span key={index} className="rq-zodiac-skeleton" aria-hidden="true" />)}
                          </>
                        ) : <span className="rq-inline-empty">{candidateReportError || "暂无可用证据"}</span>}
                      </div>
                    </div>
                  </Panel>

                  <Panel className="rq-dashboard-latest p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">最新开奖</h3><p className="mt-1 text-sm text-slate-500">{latestRawDraw?.issue ?? "-"} 期 · 平1-6 + 特码</p></div><Badge tone={hasSharedDraws ? "green" : "yellow"}>{dataSourceLabel}</Badge></div>
                    <div className="rq-dashboard-draw-strip mt-5 flex w-full flex-wrap gap-2">
                      {latestRawDraw ? [latestRawDraw.n1, latestRawDraw.n2, latestRawDraw.n3, latestRawDraw.n4, latestRawDraw.n5, latestRawDraw.n6, latestRawDraw.special].map((number, index) => <NumberTile key={`${number}-${index}`} number={number} special={index === 6} config={config} />) : <span className="text-slate-500">暂无开奖数据</span>}
                    </div>
                    <div className="rq-status-list mt-5">
                      <p><span>最后同步</span><b>{displayLastSyncAt || "未同步"}</b></p>
                      <p><span>上次计算</span><b>{lastCalculationAt || "未计算"}</b></p>
                      <p><span>公式状态</span><b>{isCandidateReferencePreparing ? "整理中" : exceptionRules.length ? `${exceptionRules.length} 条异常` : "全部正常"}</b></p>
                      <p><span>样例核对</span><b>{pendingRuleCount} 条未核对</b></p>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2"><Link href="/one-click" className="rq-link-button">计算明细</Link><Link href="/candidate-pool" className="rq-link-button rq-link-button--primary">全部依据</Link></div>
                  </Panel>
                </div>

                <details className="rq-disclosure"><summary>公式健康与异常 <span>{exceptionRules.length ? `${exceptionRules.length} 条需要注意` : "状态正常"}</span></summary><div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2"><FormulaExceptionPanel items={exceptionRules} calculableCount={calculableRuleCount} /><OperationLogPanel logs={operationLogs} /></div><div className="px-4 pb-4"><FormulaHealthPanel rows={ruleHealthRows} onToggleReserve={(ruleId) => void store.toggleReferenceParticipation(ruleId)} /></div></details>
              </div>
            )}

            {activeView === "one-click" && (
              <div className="space-y-4">
                <Panel className="rq-one-click-main rq-task-surface p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-semibold text-white">本期公式计算</h2>
                      <p className="mt-1 text-sm text-slate-500">使用最新同步开奖，或录入一组号码进行即时试算。</p>
                    </div>
                    <Button className="w-full sm:w-auto" variant="primary" disabled={oneClickCalculating} onClick={handleOneClickCalculate}>
                      <Play className="h-4 w-4" />{oneClickCalculating ? "正在计算..." : "一键计算全部公式"}
                    </Button>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
                    <div className="rq-one-click-source-card p-4">
                      <Label>计算方式</Label>
                      <div className="rq-mode-switch" role="group" aria-label="选择计算方式">
                        <button
                          type="button"
                          className={cn("rq-mode-switch__option", oneClickMode === "latest" && "is-active")}
                          aria-pressed={oneClickMode === "latest"}
                          onClick={() => { setOneClickMode("latest"); setOneClickPage(0); }}
                        >
                          <Database className="h-4 w-4" />
                          <span><b>最新开奖</b><small>使用同步数据</small></span>
                        </button>
                        <button
                          type="button"
                          className={cn("rq-mode-switch__option", oneClickMode === "manual" && "is-active")}
                          aria-pressed={oneClickMode === "manual"}
                          onClick={() => { setOneClickMode("manual"); setOneClickPage(0); }}
                        >
                          <Plus className="h-4 w-4" />
                          <span><b>手动输入</b><small>录入一期开奖</small></span>
                        </button>
                      </div>
                      <div className="mt-4 text-sm text-slate-400">
                        <p>当前期号：{selectedOneClickDraw.issue}</p>
                        {(selectedOneClickDraw.sourceUrl === "manual://user-input" || selectedOneClickDraw.rawAttributes?.sourceType === "manual") && <p className="mt-1 text-cyan-100">数据标记：人工录入</p>}
                        <p>开奖号码：{drawNumbersWithZodiac(selectedOneClickDraw, config)}</p>
                        <p>上次计算：{lastCalculationAt || "未计算"}</p>
                      </div>
                    </div>
                    {oneClickMode === "manual" ? (
                      <div className="space-y-3">
                        <div className="rq-manual-draw-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rq-manual-draw-cell min-h-[112px] p-3 sm:col-span-2 lg:col-span-4">
                            <Label>期号</Label>
                            <Input className={!String(manualDraw.issue ?? "").trim() ? "border-amber-300/40" : ""} value={manualDraw.issue} onChange={(event) => updateManualDraw("issue", event.target.value)} />
                            <p className="mt-2 text-xs leading-5 text-slate-500">不填或填 manual 会自动生成唯一期号</p>
                          </div>
                          {MANUAL_DRAW_KEYS.map((key, index) => {
                            const invalid = manualDrawValidation.invalidKeys.has(key);
                            const duplicated = manualDrawValidation.duplicatedValues.includes(Number(manualDraw[key]));
                            const isSpecial = key === "special";
                            return (
                              <div
                                key={key}
                                className={cn(
                                  "rq-manual-draw-cell min-h-[126px] p-3",
                                  isSpecial ? "border-cyan-300/28 bg-cyan-300/[0.07]" : "border-white/[0.08] bg-white/[0.03]",
                                  invalid && "border-amber-300/45 bg-amber-300/[0.07]",
                                  duplicated && "border-rose-300/45 bg-rose-300/[0.08]",
                                )}
                              >
                                <Label>{isSpecial ? "特码" : `第${index + 1}位`}</Label>
                                <div className="mt-1 grid grid-cols-[44px_1fr_44px] gap-1.5">
                                  <Button type="button" size="icon" className="rq-number-stepper-button h-11 min-w-11" onClick={() => stepManualDrawNumber(key, -1)} aria-label={`${isSpecial ? "特码" : `第${index + 1}位`}减一`}>-</Button>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    className={cn("rq-number-stepper-input h-11 text-center font-mono text-[18px]", invalid && "border-amber-300/50", duplicated && "border-rose-300/50")}
                                    value={manualDraw[key]}
                                    onChange={(event) => updateManualDraw(key, event.target.value)}
                                    onBlur={() => repairManualDrawNumber(key)}
                                    onWheel={(event) => event.currentTarget.blur()}
                                  />
                                  <Button type="button" size="icon" className="rq-number-stepper-button h-11 min-w-11" onClick={() => stepManualDrawNumber(key, 1)} aria-label={`${isSpecial ? "特码" : `第${index + 1}位`}加一`}>+</Button>
                                </div>
                                <p className={cn("mt-2 min-h-5 text-center text-xs", invalid || duplicated ? "text-rose-100" : isSpecial ? "text-cyan-100/70" : "text-slate-500")}>
                                  {invalid ? "离开输入框会自动修正" : duplicated ? "重复号码，请改一个" : numberWithZodiac(Number(manualDraw[key]), config)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        {manualDrawValidation.errors.length > 0 && (
                          <div className="rounded-md border border-amber-300/25 bg-amber-300/[0.08] p-3 text-sm text-amber-50">
                            请修正后再计算：{manualDrawValidation.errors.join("；")}。超出范围的号码离开输入框会自动调整到 1-49。
                          </div>
                        )}
                        <div className="grid gap-2 sm:flex sm:flex-wrap">
                          <Button className="w-full sm:w-auto" type="button" disabled={!manualDrawValidation.valid} onClick={() => void saveManualDraw()}><Save className="h-4 w-4" />保存人工开奖</Button>
                          <Button className="w-full sm:w-auto" type="button" variant="primary" disabled={oneClickCalculating || !manualDrawValidation.valid} onClick={handleOneClickCalculate}><Play className="h-4 w-4" />计算当前手动开奖</Button>
                        </div>
                        <p className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06] p-3 text-xs leading-5 text-cyan-50/85">手动输入会保存为“人工录入”数据，开奖数据页会单独显示，公式计算仍会合并使用。</p>
                      </div>
                    ) : (
                      <div className="rq-one-click-latest-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-slate-500">当前计算期</p>
                            <p className="mt-1 font-mono text-[24px] font-semibold leading-none text-white">{selectedOneClickDraw.issue}</p>
                          </div>
                          <Badge tone="green">{dataSourceLabel}</Badge>
                        </div>
                        <div className="rq-one-click-number-strip mt-4" aria-label={`${selectedOneClickDraw.issue}期开奖`}>
                          {[selectedOneClickDraw.n1, selectedOneClickDraw.n2, selectedOneClickDraw.n3, selectedOneClickDraw.n4, selectedOneClickDraw.n5, selectedOneClickDraw.n6, selectedOneClickDraw.special].map((number, index) => (
                            <span key={`${selectedOneClickDraw.issue}-${index}-${number}`} className={cn(index === 6 && "is-special")}>
                              <small>{index === 6 ? "特" : index + 1}</small>
                              <strong>{padNumber(number)}</strong>
                              <em>{getNumberAttributes(number, config).zodiac}</em>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {oneClickStatus && (
                    <div className={cn("mt-4 rounded-lg border p-3 text-sm", oneClickStatus.includes("失败") ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100")}>
                      {oneClickStatus}
                    </div>
                  )}
                </Panel>

                <Panel className="rq-one-click-results rq-data-surface p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-white">全部公式本期计算结果</h3>
                      <p className="text-xs text-slate-500">每条公式一行，点“查看明细”进入逐期计算流水账。</p>
                    </div>
                    <Badge tone={oneClickMode === "manual" && !manualDrawValidation.valid ? "yellow" : "green"}>
                      {oneClickMode === "manual" && !manualDrawValidation.valid ? "等待修正" : `${oneClickResults.length} 条启用公式`}
                    </Badge>
                  </div>
                  {isOneClickPreparing ? (
                    <div className="rq-inline-progress" aria-live="polite" aria-busy="true">
                      <span className="rq-progress-spinner" aria-hidden="true" />
                      <div><strong>正在准备本期计算结果</strong><p>页面已经可以操作，结果完成后会立即显示。</p></div>
                    </div>
                  ) : oneClickMode === "manual" && !manualDrawValidation.valid ? (
                    <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm leading-6 text-amber-50">
                      当前手动开奖还没填完整，系统已暂停公式计算，避免生成错误结果。把号码修正到 1-49 且不重复后，结果会自动恢复。
                    </div>
                  ) : (
                    <div className="rq-one-click-table">
                      <div className="rq-one-click-table__head" aria-hidden="true">
                        <span>公式</span><span>表达式</span><span>计算过程</span><span>本期输出</span><span>操作</span>
                      </div>
                      {pagedOneClickResults.map((item) => (
                        <OneClickResultCard key={item.ruleId} item={item} categoryLabel={categoryLabel(item.category)} onOpen={() => store.setSelectedRule(item.ruleId)} />
                      ))}
                    </div>
                  )}
                  {oneClickResults.length > oneClickPageSize && (
                    <div className="rq-pagination mt-4">
                      <span className="rq-pagination__count">显示 {safeOneClickPage * oneClickPageSize + 1}-{Math.min((safeOneClickPage + 1) * oneClickPageSize, oneClickResults.length)} / {oneClickResults.length} 条</span>
                      <div className="rq-pagination__controls">
                        <Button size="sm" disabled={safeOneClickPage === 0} onClick={() => setOneClickPage((page) => Math.max(0, page - 1))}>上一页</Button>
                        <span className="rq-pagination__page">第 {safeOneClickPage + 1} / {oneClickPageCount} 页</span>
                        <Button size="sm" disabled={safeOneClickPage >= oneClickPageCount - 1} onClick={() => setOneClickPage((page) => Math.min(oneClickPageCount - 1, page + 1))}>下一页</Button>
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            )}

            {activeView === "formula-detail" && (
              <div className="space-y-4">
                <Panel className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-white">公式逐期明细</h2>
                      <p className="mt-1 text-sm text-slate-500">像图片里的流水账一样，逐期检查公式怎么算、哪期对、哪期错。</p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 lg:items-end">
                      <Badge className="w-fit max-w-full whitespace-normal py-1 leading-4" tone={hasSharedDraws ? "green" : "rose"}>当前验证数据：{dataSourceLabel} · {activeDraws.length}期</Badge>
                      <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-[auto_1fr] lg:w-auto lg:grid-cols-[auto_320px]">
                        <Button className="w-full sm:w-auto" disabled={sourceLoading} onClick={() => void fetchSourceDraws(false, "replace")}>
                          <RefreshCw className="h-4 w-4" />同步网站全年数据
                        </Button>
                        <Select aria-label="选择公式" className="w-full min-w-0" value={selectedRuleId} onChange={(event) => store.setSelectedRule(event.target.value)}>
                          {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
                        </Select>
                      </div>
                    </div>
                  </div>
                  {selectedRuleLedger && (
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      <Metric label="验证期数" value={selectedRuleLedger.summary.total} />
                      <Metric label="正确" value={selectedRuleLedger.summary.success} tone="green" />
                      <Metric label="错误" value={selectedRuleLedger.summary.failed} tone="rose" />
                      <Metric label="成功率" value={`${selectedRuleLedger.summary.successRate}%`} />
                      <Metric label="当前连对" value={selectedRuleLedger.summary.currentStreak} tone="violet" />
                      <Metric label="最大连对" value={selectedRuleLedger.summary.maxStreak} />
                    </div>
                  )}
                  {selectedRuleLedger && (
                    <div className="mt-5 flex min-w-0 flex-wrap gap-2">
                      {selectedRuleValidation && <Badge tone={selectedRuleValidation.tone}>{selectedRuleValidation.label}</Badge>}
                      <Badge tone={selectedRule && canRuleParticipateInReference(selectedRule, selectedRuleValidation) ? "green" : "yellow"}>
                        {selectedRule && canRuleParticipateInReference(selectedRule, selectedRuleValidation) ? "参与综合参考" : "不参与综合参考"}
                      </Badge>
                      <Badge className="max-w-full whitespace-normal py-1 leading-4" tone={selectedRuleLedger.summary.failedIssues.length ? "rose" : "green"}>错期：{selectedRuleLedger.summary.failedIssues.join("、") || "暂无"}</Badge>
                      {selectedRuleValidation && <span className="min-w-0 text-sm leading-6 text-slate-400">{selectedRuleValidation.reason}</span>}
                      <Button onClick={() => void store.toggleRule(selectedRuleLedger.summary.ruleId)}>{selectedRuleLedger.summary.enabled ? "停用公式" : "启用公式"}</Button>
                      <Button
                        disabled={!selectedRuleLedger.summary.enabled || selectedRuleValidation?.status === "failed" || selectedRuleValidation?.status === "disabled"}
                        onClick={() => void store.confirmRule(selectedRuleLedger.summary.ruleId)}
                      >
                        标记用户确认
                      </Button>
                      <Button variant="danger" onClick={() => void store.deleteRule(selectedRuleLedger.summary.ruleId)}>删除公式</Button>
                    </div>
                  )}
                </Panel>

                <Panel className="p-4 sm:p-5">
                  <h3 className="font-semibold text-white">逐期计算流水账</h3>
                  <div className="mt-4 space-y-3 pr-2">
                    {selectedRuleLedger?.entries.slice(-ledgerVisibleCount).reverse().map((entry) => <FormulaLedgerRow key={entry.currentIssue} entry={entry} />)}
                  </div>
                  {selectedRuleLedger && selectedRuleLedger.entries.length > ledgerVisibleCount && (
                    <div className="mt-4 flex justify-center">
                      <Button onClick={() => setLedgerVisibleState({ ruleId: selectedRuleId, count: ledgerVisibleCount + 20 })}>加载更早 20 期</Button>
                    </div>
                  )}
                </Panel>
                <OperationLogPanel logs={operationLogs} />
              </div>
            )}

            {activeView === "formula-discovery" && (
              <div className="space-y-4">
                <Panel className="rq-rules-command p-5">
                  <div className="rq-discovery-head">
                    <div>
                      <h2 className="font-semibold text-white">公式筛选</h2>
                      <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">本地算法按 60% 训练期、20% 验证期、20% 独立留出期筛选，并比较最近表现与稳定差。推荐结果只代表历史筛选，不接入大模型，也不代表未来一定有效；确认加入公式库后才参与综合参考。</p>
                    </div>
                    <div className="rq-discovery-actions">
                      <Button size="sm" variant={discoveryDepth === "balanced" ? "primary" : "secondary"} onClick={() => { setDiscoveryElapsedSeconds(0); setDiscoveryDepth("balanced"); }}>稳健 · 2-3项</Button>
                      <Button size="sm" variant={discoveryDepth === "deep" ? "primary" : "secondary"} onClick={() => { setDiscoveryElapsedSeconds(0); setDiscoveryDepth("deep"); }}>深度 · 2-4项</Button>
                      <Button size="sm" variant={discoveryDepth === "advanced" ? "primary" : "secondary"} onClick={() => { setDiscoveryElapsedSeconds(0); setDiscoveryDepth("advanced"); }}>高级 · 2-5项</Button>
                      <Button size="sm" disabled={discoveryLoading} onClick={() => {
                        setDiscoveryElapsedSeconds(0);
                        setDiscoveryStatus("");
                        setDiscoveryFocusId("");
                        setDiscoveryRefreshId((value) => value + 1);
                      }}><RefreshCw className={cn("h-4 w-4", discoveryLoading && "animate-spin")} />重新筛选</Button>
                      <Badge tone="cyan">{discoveryLoading ? `正在筛选 · ${discoveryElapsedSeconds}秒` : `已生成 ${discoveryCandidates.length} 条候选`}</Badge>
                    </div>
                  </div>
                  {discoveryStatus && (
                    <div className={cn("mt-4 rounded-lg border p-3 text-sm", discoveryStatus.includes("失败") ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100")}>
                      {discoveryStatus}
                      {(discoveryStatus.includes("已加入公式库") || discoveryStatus.includes("已在公式库")) && <Link href="/rules" className="ml-3 text-cyan-100 underline-offset-4 hover:underline">去公式管理查看</Link>}
                    </div>
                  )}
                </Panel>
                {isFormulaDiscoveryPreparing || discoveryLoading ? (
                  <FormulaDiscoveryPendingPanel depth={discoveryDepth} elapsedSeconds={discoveryElapsedSeconds} preparing={isFormulaDiscoveryPreparing} />
                ) : (
                  <div className="rq-discovery-layout grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <div className="rq-discovery-list grid grid-cols-1 gap-3">
                      {discoveryCandidates.map((candidate) => {
                      const active = focusedDiscoveryCandidate?.rule.id === candidate.rule.id;
                      return (
                        <button
                          key={candidate.rule.id}
                          onClick={() => setDiscoveryFocusId(candidate.rule.id)}
                          className={cn("rq-list-card rounded-xl border p-4 text-left transition", active && "rq-list-card--active")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-medium text-white">{candidate.rule.formula}</h3>
                              <p className="mt-1 text-xs text-slate-500">{categoryLabel(candidate.rule.category)} · {candidate.rule.orderMode}序 · {candidate.complexity} 项</p>
                            </div>
                            <Badge tone={candidate.validationRate >= candidate.trainingRate - 10 ? "green" : "yellow"}>{candidate.validationRate}%</Badge>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-3 xl:grid-cols-6">
                            <span>训练 {candidate.trainingRate}%</span>
                            <span>验证 {candidate.validationRate}%</span>
                            <span>留出 {candidate.holdoutRate}%</span>
                            <span>近10 {candidate.recentRate}%</span>
                            <span>稳定差 {candidate.stabilityGap}</span>
                            <span>错 {candidate.failed}</span>
                          </div>
                          <p className="mt-3 text-xs text-rose-200">错期：{candidate.failedIssues.slice(0, 6).join("、") || "暂无"}</p>
                        </button>
                      );
                      })}
                    </div>
                    <DiscoveryDetailPanel
                      candidate={focusedDiscoveryCandidate}
                      categoryLabel={focusedDiscoveryCandidate ? categoryLabel(focusedDiscoveryCandidate.rule.category) : ""}
                      onAdd={(candidate) => void addDiscoveredRule(candidate.rule)}
                      existingRule={focusedDiscoveryExistingRule}
                      draws={activeDraws}
                      config={config}
                    />
                  </div>
                )}
              </div>
            )}

            {activeView === "special-analysis" && (
              <SpecialAnalysisView
                draws={activeDraws}
                config={config}
                dataSourceLabel={dataSourceLabel}
                sourceLoading={sourceLoading}
                onSync={() => void fetchSourceDraws(true, "replace")}
              />
            )}

            {activeView === "draws" && (
              <Panel className="p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-white">历史开奖数据</h2>
                    <p className="text-xs text-slate-500">系统自动生成 L序、D序、特码属性、总数和期号属性</p>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                    <Button className="w-full sm:w-auto" variant="primary" disabled={sourceLoading} onClick={() => void fetchSourceDraws(true, "replace")}>
                      <RefreshCw className="h-4 w-4" />{sourceLoading ? "同步中" : "同步并写入本地库"}
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={() => exportDrawsCsv(activeDraws)}><Download className="h-4 w-4" />导出 CSV</Button>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                  <Badge tone={hasSharedDraws ? "green" : "slate"}>{dataSourceLabel}</Badge>
                  <span>最新期：{latestDraw?.issue ?? "-"}</span>
                  <span>计算使用：网站 {websiteDraws.length || Math.max(0, activeDraws.length - manualLocalDraws.length)} 条 + 人工 {manualLocalDraws.length} 条 = {activeDraws.length} 条</span>
                  <span>最后同步：{displayLastSyncAt || "未同步"}</span>
                  {sourceStatus && <span>{sourceStatus}</span>}
                </div>
                {manualLocalDraws.length > 0 && (
                  <div className="mb-4 rounded-md border border-cyan-300/20 bg-cyan-300/[0.055] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-cyan-50">人工录入开奖</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          这些记录保存在本机开奖库，并已合并进当前计算数据。期号相同会覆盖旧记录；要保留多条请填写不同期号。
                        </p>
                      </div>
                      <Badge tone="cyan">{manualLocalDraws.length} 条</Badge>
                    </div>
                    <div className="mt-3 grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
                      {[...manualLocalDraws].reverse().map((draw) => (
                        <div key={draw.issue} className="rounded-md border border-white/[0.075] bg-black/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-sm font-semibold text-white">{draw.issue}期</p>
                            <div className="flex items-center gap-2">
                              <Badge tone="cyan">人工录入</Badge>
                              <Button size="sm" variant="danger" onClick={() => void deleteManualDraw(draw.issue)}>删除</Button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {[draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6].map((number, index) => (
                              <NumberTile key={`${draw.issue}-${index}-${number}`} number={number} config={config} />
                            ))}
                            <span className="px-1 font-mono text-lg text-cyan-100">+</span>
                            <NumberTile number={draw.special} special config={config} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">保存时间：{String(draw.rawAttributes?.savedAt ?? "-")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <DrawHistoryMobileList draws={[...normalizedDraws].reverse()} config={config} />
                <div className="hidden md:block">
                  <DataTable data={[...normalizedDraws].reverse()} columns={drawColumns} dense />
                </div>
              </Panel>
            )}

            {activeView === "import" && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
                <Panel className="p-4 sm:p-5">
                  <h2 className="font-semibold text-white">导入开奖数据</h2>
                  <p className="mb-4 text-sm text-slate-500">支持网址实时抓取、CSV、Excel、TXT、HTML、粘贴表格。字段可使用 issue/date/n1-n6/special 或中文字段。</p>
                  <div className="mb-5 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
                    <h3 className="font-medium text-cyan-100">网址实时抓取</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_96px_96px]">
                      <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
                      <Input type="number" value={sourceFromYear} onChange={(event) => setSourceFromYear(event.target.value)} />
                      <Input type="number" value={sourceToYear} onChange={(event) => setSourceToYear(event.target.value)} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="primary" disabled={sourceLoading} onClick={() => void fetchSourceDraws(true, "replace")}>
                        <RefreshCw className="h-4 w-4" />{sourceLoading ? "同步中" : "同步并写入本地库"}
                      </Button>
                      <Button disabled={!sourceRecords.length} onClick={() => void replaceLocalDrawsWithSourceRecords()}>
                        <Save className="h-4 w-4" />替换本地库
                      </Button>
                    </div>
                    {sourceStatus && <p className="mt-3 text-sm text-slate-300">{sourceStatus}</p>}
                    {sourceSummaries.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-3">
                        {sourceSummaries.map((item) => (
                          <div key={`${item.year}-${item.url}`} className="rounded-md border border-white/[0.06] bg-black/20 p-2">
                            {item.year} · {item.count} 条{item.error ? ` · ${item.error}` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <h3 className="mb-2 font-medium text-white">文本 / 文件导入</h3>
                  <Textarea value={importText} onChange={(event) => setImportText(event.target.value)} className="min-h-64 font-mono" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="primary" onClick={handleParseImport}><ListChecks className="h-4 w-4" />解析预览</Button>
                    <Button disabled={!previewDraws.length} onClick={handleImportPreview}><Save className="h-4 w-4" />写入本地库</Button>
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-4 text-sm text-slate-100 hover:bg-white/[0.09]">
                      <Upload className="h-4 w-4" />选择文件
                      <input className="hidden" type="file" accept=".csv,.txt,.xlsx,.xls,.html,.htm" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0])} />
                    </label>
                  </div>
                </Panel>
                <Panel className="p-5">
                  <h3 className="font-semibold text-white">导入预检</h3>
                  <p className="mt-1 text-sm text-slate-500">重复期号、号码范围、七码完整性会在这里提示。</p>
                  <div className="mt-4 space-y-2">
                    <Badge tone={importErrors.length ? "rose" : "green"}>{importErrors.length ? `${importErrors.length} 个问题` : "可导入"}</Badge>
                    {importErrors.map((error) => <p key={error} className="text-sm text-rose-200">{error}</p>)}
                    <p className="text-sm text-slate-300">预览记录：{previewDraws.length}</p>
                    {previewDraws.slice(0, 5).map((draw) => (
                      <div key={draw.issue} className="rounded-md border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-slate-300">
                        {draw.issue} · {[draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special].join(" ")}
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {activeView === "rules" && (
              <div className="space-y-4">
                <Panel className="p-5">
                  <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-white">公式库与运行状态</h2>
                      <p className="text-xs text-slate-500">查看公式状态、最近表现和逐期明细；样例不一致会提示核对，计算报错、变量不确定或停用公式不参与综合参考。</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="slate">全部 {rules.length}</Badge>
                        <Badge tone="cyan">人工新增 {manualRuleCount}</Badge>
                        <Badge tone="violet">系统推荐 {systemRecommendedRuleCount}</Badge>
                        <Badge tone="green">参与参考 {referenceRuleCount}</Badge>
                      </div>
                    </div>
                    <div className="rq-rule-actions w-full xl:w-auto">
                      <Link href="/formula-editor?mode=new" className="rq-link-button rq-link-button--primary h-11 min-w-0 whitespace-nowrap px-3 text-[13px] sm:h-10 sm:min-w-[116px] sm:px-4 sm:text-sm">
                        <Plus className="h-4 w-4" />新增规则
                      </Link>
                      <button type="button" className="rq-rule-tools-toggle" aria-expanded={mobileRuleToolsOpen} onClick={() => setMobileRuleToolsOpen((open) => !open)}>
                        <Settings2 className="h-4 w-4" />更多与筛选
                      </button>
                      <div className={cn("rq-rule-secondary-actions", mobileRuleToolsOpen && "is-open")}>
                        <Button onClick={() => selectedRule && void store.duplicateRule(selectedRule.id)}>复制公式</Button>
                        <Button onClick={() => exportRuleLibraryWord(rules)}><FileDown className="h-4 w-4" />下载全部公式</Button>
                        <Link href="/one-click" className="rq-link-button">试算公式</Link>
                      </div>
                    </div>
                  </div>
                  <div className={cn("rq-rule-filter-grid mb-4 grid grid-cols-1 gap-2 md:grid-cols-3", mobileRuleToolsOpen && "is-open")}>
                    <Select aria-label="选择公式类型" value={ruleFilter} onChange={(event) => { setRuleFilter(event.target.value as RuleCategory | "all"); setRulePage(0); }}>
                      <option value="all">全部类型</option>
                      {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </Select>
                    <Select aria-label="筛选公式" value={ruleLibraryFilter} onChange={(event) => {
                      const nextFilter = event.target.value as RuleLibraryFilter;
                      setRuleLibraryFilter(nextFilter);
                      setRulePage(0);
                      if (["user_provided", "system_recommended", "manual", "txt_import", "copied"].includes(nextFilter)) setRuleFilter("all");
                    }}>
                      <option value="all">筛选：全部公式</option>
                      <option value="user_provided">筛选：用户提供</option>
                      <option value="system_recommended">筛选：系统推荐</option>
                      <option value="manual">筛选：人工新增</option>
                      <option value="txt_import">筛选：TXT 导入</option>
                      <option value="copied">筛选：复制公式</option>
                      <option value="enabled">筛选：已启用</option>
                      <option value="disabled">筛选：已停用</option>
                      <option value="calculable">筛选：可计算</option>
                      <option value="error">筛选：计算异常</option>
                    </Select>
                    <Select aria-label="排序公式" value={ruleSort} onChange={(event) => { setRuleSort(event.target.value as RuleSortKey); setRulePage(0); }}>
                      <option value="smart">排序：智能学习排行</option>
                      <option value="success_desc">排序：成功率从高到低</option>
                      <option value="recent_desc">排序：最近10期从好到差</option>
                      <option value="wrong_asc">排序：连错少的在前</option>
                      <option value="failed_asc">排序：错期少的在前</option>
                      <option value="streak_desc">排序：当前连对从高到低</option>
                      <option value="name_asc">排序：公式名称</option>
                    </Select>
                  </div>
                   <nav className="rq-workspace-tabs rq-rules-workspace-tabs mb-4" aria-label="公式管理工作区">
                    {[
                      ["library", "公式库", `${visibleRules.length} 条公式`],
                       ["health", "运行健康", isRuleManagementCalculating ? "整理中" : `${exceptionRules.length} 条异常`],
                      ["reconcile", "规则对账", `${rawRuleFiles.length} 个来源`],
                    ].map(([key, label, hint]) => <button key={key} type="button" className={cn("rq-workspace-tab", rulesWorkspaceTab === key && "rq-workspace-tab--active")} onClick={() => setRulesWorkspaceTab(key as typeof rulesWorkspaceTab)}><span>{label}</span><small>{hint}</small></button>)}
                   </nav>
                   <div className={cn("rq-analysis-status rq-rule-loading-banner mb-4", isRuleManagementCalculating && "is-loading", ruleManagementBacktestError && "is-error")} role="status" aria-live="polite">
                     {isRuleManagementCalculating ? (
                       <><span className="rq-progress-spinner" aria-hidden="true" /><div><strong>公式库已打开，正在整理历史表现</strong><small>现在可以筛选、翻页和查看规则，成功率与最近表现会自动补齐。</small></div></>
                     ) : ruleManagementBacktestError ? (
                       <><XCircle className="h-5 w-5" /><div><strong>历史表现暂未完成</strong><small>{ruleManagementBacktestError}</small></div></>
                     ) : (
                       <><CheckCircle2 className="h-5 w-5" /><div><strong>历史表现已就绪</strong><small>已完成 {backtest.ruleResults.length} 条启用公式的历史回放与状态整理。</small></div></>
                     )}
                   </div>
                   {rulesWorkspaceTab === "library" && <>
                  <div className="rq-smart-note mb-4 p-3 text-sm leading-6">
                    智能学习排行会根据历史成功率、最近10期表现、当前连对、连错和错期自动调权；只是帮助排序和降权，所有结果仍然来自公式计算证据。
                  </div>
                  <div className="rq-master-detail">
                    <section className="rq-master-pane" aria-label="公式列表">
                      <div className="rq-master-pane__head">
                        <div><strong>公式库</strong><span>{visibleRules.length} 条结果</span></div>
                        <div className="rq-master-page-controls">
                          <Button
                            size="sm"
                            disabled={safeRulePage === 0}
                            title="上一页"
                            aria-label="公式列表上一页"
                            onClick={() => {
                              const nextPage = Math.max(0, safeRulePage - 1);
                              setRulePage(nextPage);
                              const firstRule = visibleRules[nextPage * rulePageSize];
                              if (firstRule) store.setSelectedRule(firstRule.id);
                            }}
                          ><ChevronLeft className="h-4 w-4" />上一页</Button>
                          <Badge tone="slate">第 {safeRulePage + 1}/{rulePageCount} 页</Badge>
                          <Button
                            size="sm"
                            disabled={safeRulePage >= rulePageCount - 1}
                            title="下一页"
                            aria-label="公式列表下一页"
                            onClick={() => {
                              const nextPage = Math.min(rulePageCount - 1, safeRulePage + 1);
                              setRulePage(nextPage);
                              const firstRule = visibleRules[nextPage * rulePageSize];
                              if (firstRule) store.setSelectedRule(firstRule.id);
                            }}
                          >下一页<ChevronRight className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      <div className="rq-rule-rows rq-scrollbar">
                        {pagedRules.map((rule) => {
                          const result = ruleResultMap.get(rule.id);
                          const summary = ruleValidationById.get(rule.id);
                          const joinsReference = canRuleParticipateInReference(rule, summary);
                          return (
                            <button
                              type="button"
                              key={rule.id}
                              className={cn("rq-rule-row", selectedRuleId === rule.id && "rq-rule-row--active")}
                              onClick={() => store.setSelectedRule(rule.id)}
                            >
                              <span className={cn("rq-rule-row__status", isRuleManagementCalculating ? "is-loading" : result?.error || !result?.total ? "is-error" : joinsReference ? "is-active" : "is-muted")} />
                              <span className="rq-rule-row__body">
                                <strong>{rule.name}</strong>
                                <small>{categoryLabel(rule.category)} · {rule.orderMode}序 · {sourceTypeLabel(rule.sourceType)}</small>
                              </span>
                              <span className="rq-rule-row__score">
                                <strong>{isRuleManagementCalculating ? "计算中" : `${result?.successRate ?? 0}%`}</strong>
                                <small>{isRuleManagementCalculating ? "历史表现整理中" : `近10 ${recentSuccessCount(result)}/${result?.last10.length ?? 0}`}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rq-inspector-pane" aria-label="公式详情">
                      {inspectedRule ? (
                        <>
                          <div className="rq-inspector-head">
                            <div className="min-w-0">
                              <p className="rq-eyebrow">当前公式</p>
                              <h3>{inspectedRule.name}</h3>
                              <p>{categoryLabel(inspectedRule.category)} · {inspectedRule.orderMode}序 · {sourceTypeLabel(inspectedRule.sourceType)}</p>
                            </div>
                            <Badge tone={canRuleParticipateInReference(inspectedRule, inspectedRuleSummary) ? "green" : "yellow"}>
                              {canRuleParticipateInReference(inspectedRule, inspectedRuleSummary) ? "参与计算" : "不参与计算"}
                            </Badge>
                          </div>
                          <div className="rq-formula-display"><span>公式</span><code>{inspectedRule.formula}</code></div>
                          <div className="rq-inspector-metrics">
                            <div><span>历史成功率</span><strong>{isRuleManagementCalculating ? "—" : `${inspectedRuleResult?.successRate ?? 0}%`}</strong></div>
                            <div><span>最近 10 期</span><strong>{isRuleManagementCalculating ? "—" : `${recentSuccessCount(inspectedRuleResult)}/${inspectedRuleResult?.last10.length ?? 0}`}</strong></div>
                            <div><span>当前连对</span><strong>{isRuleManagementCalculating ? "—" : inspectedRuleResult?.currentStreak ?? 0}</strong></div>
                            <div><span>当前连错</span><strong>{isRuleManagementCalculating ? "—" : consecutiveWrong(inspectedRuleResult)}</strong></div>
                          </div>
                          <div className="rq-inspector-status">
                            <div><span>计算状态</span><b className={isRuleManagementCalculating ? "" : inspectedRuleResult?.error || !inspectedRuleResult?.total ? "is-error" : "is-good"}>{isRuleManagementCalculating ? "历史表现整理中" : inspectedRuleResult?.error || !inspectedRuleResult?.total ? "计算异常" : "可正常计算"}</b></div>
                            <div><span>样例核对</span><b>{inspectedRuleSummary?.label ?? "未核对"}</b></div>
                            <div><span>智能排行分</span><b>{ruleSmartScore(inspectedRule, inspectedRuleResult) > -9999 ? ruleSmartScore(inspectedRule, inspectedRuleResult) : "-"}</b></div>
                          </div>
                          {inspectedRuleSummary?.reason && <p className="rq-inspector-note">{inspectedRuleSummary.reason}</p>}
                          <div className="rq-inspector-actions">
                            <Link href="/formula-detail" onClick={() => store.setSelectedRule(inspectedRule.id)} className="rq-link-button rq-link-button--primary"><Eye className="h-4 w-4" />逐期明细</Link>
                            <Link href={`/formula-editor?ruleId=${encodeURIComponent(inspectedRule.id)}`} className="rq-link-button">编辑规则</Link>
                            <details key={inspectedRule.id} className="rq-inspector-more">
                              <summary>更多操作<ChevronDown className="h-4 w-4" /></summary>
                              <div className="rq-inspector-more__menu">
                                <Button size="sm" disabled={!inspectedRule.enabled || inspectedRuleSummary?.status === "failed" || inspectedRuleSummary?.status === "disabled"} onClick={() => void store.confirmRule(inspectedRule.id)}>标记确认</Button>
                                <Button size="sm" onClick={() => void store.toggleReferenceParticipation(inspectedRule.id)}>{inspectedRule.participatesInReference === false ? "参与参考" : "退出参考"}</Button>
                                <Button size="sm" onClick={() => void store.toggleRule(inspectedRule.id)}>{inspectedRule.enabled ? "停用" : "启用"}</Button>
                                <Button size="sm" onClick={() => void store.duplicateRule(inspectedRule.id)}>复制公式</Button>
                                <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`确认删除「${inspectedRule.name}」吗？`)) void store.deleteRule(inspectedRule.id); }}>删除公式</Button>
                              </div>
                            </details>
                          </div>
                        </>
                      ) : <p className="rq-empty-copy">没有符合当前筛选的公式。</p>}
                    </section>
                  </div>
                  </>}
                  {rulesWorkspaceTab === "health" && <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
                      <FormulaLibraryBackupPanel
                        rules={rules}
                        backups={ruleBackups}
                        status={ruleLibraryStatus}
                        onImport={(file) => void handleRuleLibraryFile(file)}
                        onReset={() => void store.resetRules()}
                        onRestore={() => void store.restoreLastRuleBackup()}
                      />
                      <FormulaExceptionPanel items={exceptionRules} calculableCount={calculableRuleCount} />
                    </div>
                    <FormulaHealthPanel rows={ruleHealthRows} onToggleReserve={(ruleId) => void store.toggleReferenceParticipation(ruleId)} />
                  </div>}
                  {rulesWorkspaceTab === "reconcile" && <div className="space-y-4">
                    <RuleReconciliationPanel rows={ruleReconciliationRows} />
                  </div>}
                </Panel>
              </div>
            )}

            {activeView === "formula-editor" && (
              editorRule ? (
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[360px_1fr_320px]">
                  <RuleForm
                    key={editorRule.id}
                    selectedRule={editorRule}
                    onSave={saveRuleFromForm}
                    compact
                    draw={latestDraw ?? normalizedDraws[0]}
                    config={config}
                    periodIndex={latestDraw ? latestPeriodIndex : 0}
                  />
                  <FormulaWorkbench rule={editorRule} draw={latestDraw ?? normalizedDraws[0]} config={config} periodIndex={latestDraw ? latestPeriodIndex : 0} />
                  <Panel className="p-5">
                    <h3 className="font-semibold text-white">编辑旧规则</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">当前是编辑模式，只会保存修改到这条规则。新增请从公式管理点击“新增规则”。</p>
                    <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-slate-300">
                      <p>试算期：{latestDraw?.issue ?? "-"}</p>
                      <p className="mt-2 font-mono text-cyan-100">{latestNumbersLabel}</p>
                    </div>
                  </Panel>
                </div>
              ) : (
                <NewRuleBuilder
                  onSave={saveRuleFromForm}
                  draw={latestDraw ?? normalizedDraws[0]}
                  config={config}
                  periodIndex={latestDraw ? latestPeriodIndex : 0}
                />
              )
            )}

            {activeView === "backtest" && (
              <div className="space-y-4">
                <Panel className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-white">回测中心</h2>
                      <p className="text-xs text-slate-500">当前使用 {dataSourceLabel} · {activeDraws.length} 期；默认用第 N 期计算，验证第 N+1 期的特码属性。</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary"><Play className="h-4 w-4" />已实时运行</Button>
                      <Button onClick={() => exportBacktestExcel(backtest)}><Download className="h-4 w-4" />导出结果</Button>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <Metric label="总验证期数" value={selectedRuleResult?.total ?? 0} />
                    <Metric label="成功期数" value={selectedRuleResult?.success ?? 0} tone="green" />
                    <Metric label="失败期数" value={selectedRuleResult?.failed ?? 0} tone="rose" />
                    <Metric label="成功率" value={`${selectedRuleResult?.successRate ?? 0}%`} />
                    <Metric label="当前连对" value={selectedRuleResult?.currentStreak ?? 0} tone="violet" />
                  </div>
                </Panel>
                <Panel className="p-5">
                  <DataTable data={[...(selectedRuleResult?.details ?? [])].reverse()} columns={detailColumns} dense />
                </Panel>
                <ProcessInspector detail={selectedRuleResult?.details.at(-1)} />
              </div>
            )}

            {activeView === "candidate-pool" && (
              <div className="rq-candidate-page space-y-4">
                <Panel className="rq-candidate-control p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-white">本期综合依据</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-400">先同步最新开奖，再重新生成结果；每个号码都可以继续查看支持和排除依据。</p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 xl:flex xl:w-auto xl:flex-wrap xl:justify-end">
                      <Button className="w-full xl:w-auto" disabled={sourceLoading} variant="primary" onClick={() => void fetchSourceDraws(true, "replace")}>
                        <RefreshCw className="h-4 w-4" /><span className="sm:hidden">{sourceLoading ? "同步中" : "同步开奖"}</span><span className="hidden sm:inline">{sourceLoading ? "同步中" : "同步配置开奖源"}</span>
                      </Button>
                      <Button className="w-full xl:w-auto" onClick={handleRegenerateReference} disabled={referenceCalculating}>
                        <Activity className="h-4 w-4" /><span className="sm:hidden">{referenceCalculating ? "计算中" : "重新生成"}</span><span className="hidden sm:inline">{referenceCalculating ? "正在计算公式信号..." : "重新生成综合参考结果"}</span>
                      </Button>
                      <Button className="col-span-2 w-full xl:w-auto" disabled={!candidateReport.signalCount} onClick={() => void saveReferenceReport(candidateReport, "manual", "用户手动保存当前综合推荐")}>
                        <Save className="h-4 w-4" /><span className="sm:hidden">保存推荐</span><span className="hidden sm:inline">保存本次推荐</span>
                      </Button>
                    </div>
                  </div>
                  <div className="rq-source-status mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-4 text-sm text-slate-400">
                    <Badge tone={sourceRecordBadgeTone}>{sourceRecordBadgeLabel}</Badge>
                    <span>{sourceStatus || "打开本页会自动同步一次并写入本地库；网站每天更新后，也可以手动重新同步。"}</span>
                  </div>
                  {referenceStatus && <p className="rq-reference-feedback mt-3" role="status">{referenceStatus}</p>}
                </Panel>

                <nav className="rq-workspace-tabs rq-candidate-workspace-tabs" role="tablist" aria-label="综合参考工作区">
                  {[
                    ["results", "本期结果", "号码与生肖排序"],
                    ["evidence", "公式依据", isCandidateReferencePreparing ? "整理中" : `${candidateReport.signalCount} 条证据`],
                    ["history", "历史复盘", `${referenceHistory.length} 次保存`],
                    ["combo", "自选公式组合", `${selectedComboRuleIds.length || Math.min(6, referenceRuleCount)} 条已选`],
                    ["operations", "运行状态", isCandidateReferencePreparing ? "整理中" : exceptionRules.length ? `${exceptionRules.length} 条异常` : "状态正常"],
                  ].map(([key, label, hint]) => (
                    <button key={key} type="button" role="tab" aria-selected={candidateWorkspaceTab === key} className={cn("rq-workspace-tab", candidateWorkspaceTab === key && "rq-workspace-tab--active")} onClick={() => setCandidateWorkspaceTab(key as typeof candidateWorkspaceTab)}>
                      <span>{label}</span><small>{hint}</small>
                    </button>
                  ))}
                </nav>

                {(candidateWorkspaceTab === "history" || candidateWorkspaceTab === "combo" || candidateWorkspaceTab === "operations") && (
                  <section className="rq-candidate-workspace rq-workspace-panel rq-scrollbar">
                {candidateWorkspaceTab === "operations" && <>
                <div className="rq-summary-rail rq-card-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LatestDrawCard draw={latestRawDraw} config={config} issue={candidateReport.latestIssue ?? latestRawDraw?.issue} source="平1-6 + 特码，号码下方标注生肖" />
                  <Metric label="使用最新期号" value={candidateReport.latestIssue ?? "-"} hint={candidateReport.latestDate ?? "-"} tone="violet" />
                  <Metric label="数据来源" value={dataSourceLabel} hint={sourceRecords.length ? "已同步" : "本地"} />
                  <Metric label="启用公式" value={enabledRuleCount} hint={`手动排除 ${excludedRuleCount}`} tone="green" />
                  <Metric label="用户提供公式" value={userProvidedRuleCount} hint="默认可参与" tone="green" />
                  <Metric label="人工新增公式" value={manualRuleCount} hint="用户决定" tone="cyan" />
                  <Metric label="系统推荐公式" value={systemRecommendedRuleCount} hint="确认后参与" tone="violet" />
                  <Metric label="可计算公式" value={calculableRuleCount} hint="无变量错误" tone="cyan" />
                  <Metric label="实际参与公式" value={candidateReport.ruleCount} hint="本次计算" tone="green" />
                  <Metric label="样例已核对" value={checkedSampleRuleCount} hint={`未核对 ${uncheckedSampleRuleCount}`} tone="yellow" />
                  <Metric label="本次生成证据" value={candidateReport.signalCount} hint="支持/排除" />
                  <Metric label="结果生成时间" value={(referenceGeneratedAt || candidateReport.generatedAt) ? new Date(referenceGeneratedAt || candidateReport.generatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "-"} hint="本次结果" />
                  <Metric label="同步状态" value={isUsingSyncedData ? "已使用最新数据" : "需要同步"} hint={latestRawDraw?.issue ? `期号 ${latestRawDraw.issue}` : "未同步"} tone={isUsingSyncedData ? "green" : "yellow"} />
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Panel className="rq-explainer-panel p-5">
                    <p className="rq-eyebrow">结果说明</p>
                    <h3 className="font-semibold text-white">综合结果从哪里来</h3>
                    <div className="rq-explainer-steps mt-4">
                      <p><b>01</b><span><strong>历史数据</strong><small>判断公式过去表现、错期和最近走势。</small></span></p>
                      <p><b>02</b><span><strong>最新开奖</strong><small>代入启用且可计算的公式生成支持与排除。</small></span></p>
                      <p><b>03</b><span><strong>综合排序</strong><small>合并真实公式证据，仅用于公式研究和参考排序。</small></span></p>
                    </div>
                  </Panel>
                  <Panel className="rq-source-panel p-5">
                    <p className="rq-eyebrow">数据源设置</p>
                    <h3 className="font-semibold text-white">开奖源与年份</h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_110px]">
                      <Input aria-label="开奖数据来源" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
                      <Input aria-label="开始年份" type="number" value={sourceFromYear} onChange={(event) => setSourceFromYear(event.target.value)} />
                      <Input aria-label="结束年份" type="number" value={sourceToYear} onChange={(event) => setSourceToYear(event.target.value)} />
                    </div>
                    <Button className="mt-3 w-full sm:w-auto" disabled={!sourceRecords.length} onClick={() => void replaceLocalDrawsWithSourceRecords()}><Save className="h-4 w-4" />用同步数据替换本地库</Button>
                  </Panel>
                </div>
                {shouldWarnStaleData && (
                  <Panel className="border-amber-300/25 bg-amber-300/[0.07] p-4">
                    <p className="text-sm text-amber-100">当前可能不是最新开奖数据，请先同步。同步新一期开奖后，系统会重新计算综合参考结果。</p>
                  </Panel>
                )}
                </>}
                {candidateWorkspaceTab === "history" && <>
                <Panel className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h3 className="font-semibold text-white">历史预测复盘保存</h3>
                      <p className="mt-1 text-sm text-slate-500">选择以前某一期，系统会按那一期及以前的数据重新生成当时的综合推荐，并自动和后续开奖对比命中情况。</p>
                    </div>
                    <div className="rq-history-save-controls">
                      <IssuePicker
                        value={selectedReferenceArchiveIssue}
                        options={[...activeDraws].sort((a, b) => Number(b.issue) - Number(a.issue)).map((draw) => draw.issue)}
                        onChange={setReferenceArchiveIssue}
                      />
                      <Button className="rq-history-save-button" variant="primary" disabled={referenceArchiveSaving || !isCandidatePoolReady || !selectedReferenceArchiveIssue} onClick={() => saveReferenceArchiveForIssue(selectedReferenceArchiveIssue)}>
                        <Save className="h-4 w-4" />{referenceArchiveSaving ? "正在保存复盘..." : "保存这期历史复盘"}
                      </Button>
                    </div>
                  </div>
                </Panel>
                {isCandidateHistoryPreparing ? (
                  <div className="rq-inline-progress" aria-live="polite" aria-busy="true">
                    <span className="rq-progress-spinner" aria-hidden="true" />
                    <div><strong>正在准备历史复盘</strong><p>页面保持可用，系统正在按过去开奖逐期重建当时的综合排序。</p></div>
                  </div>
                ) : <ReferenceObservationPanel report={referenceObservation} />}
                <ReferenceHistoryPanel
                  records={resolvedReferenceHistory}
                  config={config}
                  onDelete={(recordId) => void store.deleteReferenceHistory(recordId)}
                  onClear={() => void store.clearReferenceHistory()}
                  onExportJson={() => exportJson(resolvedReferenceHistory, "rulequant-reference-history.json")}
                  onExportExcel={() => exportReferenceHistoryExcel(resolvedReferenceHistory)}
                  onExportWord={() => exportReferenceHistoryWord(resolvedReferenceHistory)}
                  onExportText={() => exportReferenceHistoryText(resolvedReferenceHistory)}
                />
                </>}
                {candidateWorkspaceTab === "operations" && <>
                {exceptionRules.length > 0 && <FormulaExceptionPanel items={exceptionRules} calculableCount={calculableRuleCount} />}
                <FormulaHealthPanel rows={ruleHealthRows} onToggleReserve={(ruleId) => void store.toggleReferenceParticipation(ruleId)} compact />
                <OperationLogPanel logs={operationLogs} />
                </>}
                {candidateWorkspaceTab === "combo" && <>
                <ManualCombinationPanel
                  rules={rules}
                  selectedRuleIds={selectedComboRuleIds}
                  setSelectedRuleIds={setSelectedComboRuleIds}
                  report={manualComboReport}
                  validationById={ruleValidationById}
                />
                </>}
                  </section>
                )}

                {candidateWorkspaceTab === "results" && (isCandidatePoolPreparing || isCandidateReferencePreparing ? (
                  <div className="rq-inline-progress" aria-live="polite" aria-busy="true">
                    <span className="rq-progress-spinner" aria-hidden="true" />
                    <div><strong>正在生成本期综合依据</strong><p>公式历史表现正在整理，完成后会自动显示号码、生肖和对应证据。</p></div>
                  </div>
                ) : candidateReport.ruleCount === 0 || candidateReport.signalCount === 0 ? (
                  <ReferenceEmptyState />
                ) : (
                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_420px]">
                    <Panel className="rq-candidate-result-surface p-5">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-white">综合参考结果</h3>
                          <p className="text-xs text-slate-500">本结果由历史公式表现和最新一期公式计算结果综合生成，仅供参考。</p>
                        </div>
                        <div className="rq-candidate-controls">
                          <div className="rq-segmented-control" aria-label="结果类型">
                            <Button size="sm" variant={candidateTab.startsWith("numbers") ? "primary" : "ghost"} onClick={() => setCandidateTab("numbers8")}>号码</Button>
                            <Button size="sm" variant={candidateTab.startsWith("zodiacs") ? "primary" : "ghost"} onClick={() => setCandidateTab("zodiacs8")}>生肖</Button>
                          </div>
                          <div className="rq-segmented-control" aria-label="结果范围">
                            {candidateTab.startsWith("numbers") ? ([8, 12, 16, 18] as const).map((count) => {
                              const key = `numbers${count}` as typeof candidateTab;
                              return <Button key={count} size="sm" variant={candidateTab === key ? "primary" : "ghost"} onClick={() => setCandidateTab(key)}>Top {count}</Button>;
                            }) : ([7, 8, 9] as const).map((count) => {
                              const key = `zodiacs${count}` as typeof candidateTab;
                              return <Button key={count} size="sm" variant={candidateTab === key ? "primary" : "ghost"} onClick={() => setCandidateTab(key)}>Top {count}</Button>;
                            })}
                            {candidateTab.startsWith("numbers")
                              ? <Button size="sm" variant={candidateTab === "numbers49" ? "primary" : "ghost"} onClick={() => setCandidateTab("numbers49")}>全量49</Button>
                              : <Button size="sm" variant={candidateTab === "zodiacs12" ? "primary" : "ghost"} onClick={() => setCandidateTab("zodiacs12")}>全部12肖</Button>}
                          </div>
                        </div>
                      </div>
                      <div className="mb-4 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.055] p-3 text-xs leading-5 text-cyan-50/85">
                        先看重点 Top 8；它会优先选择直接支持更强、反对更少、净证据更好的号码。Top 18 只作为宽参考，不建议当作主选择范围。
                      </div>
                      {candidateTab === "numbers8" && <CandidateNumberList items={candidateReport.topNumbers8} focus={candidateFocus} onFocus={setCandidateFocus} compact />}
                      {candidateTab === "numbers12" && <CandidateNumberList items={candidateReport.topNumbers12} focus={candidateFocus} onFocus={setCandidateFocus} compact />}
                      {candidateTab === "numbers18" && <CandidateNumberList items={candidateReport.topNumbers18} focus={candidateFocus} onFocus={setCandidateFocus} />}
                      {candidateTab === "numbers16" && <CandidateNumberList items={candidateReport.topNumbers16} focus={candidateFocus} onFocus={setCandidateFocus} />}
                      {candidateTab === "numbers49" && <CandidateNumberList items={candidateReport.allNumbers} focus={candidateFocus} onFocus={setCandidateFocus} compact />}
                      {candidateTab === "zodiacs12" && <CandidateZodiacList items={candidateReport.allZodiacs} focus={candidateFocus} onFocus={setCandidateFocus} />}
                      {candidateTab === "zodiacs9" && <CandidateZodiacList items={candidateReport.topZodiacs9} focus={candidateFocus} onFocus={setCandidateFocus} />}
                      {candidateTab === "zodiacs8" && <CandidateZodiacList items={candidateReport.topZodiacs8} focus={candidateFocus} onFocus={setCandidateFocus} />}
                      {candidateTab === "zodiacs7" && <CandidateZodiacList items={candidateReport.topZodiacs7} focus={candidateFocus} onFocus={setCandidateFocus} />}
                    </Panel>
                    <CandidateEvidencePanel candidate={focusedCandidate} />
                  </div>
                ))}

                {candidateWorkspaceTab === "evidence" && (
                <section className="rq-evidence-workspace">
                <Panel className="rq-evidence-panel p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-white">公式依据明细</h3>
                      <p className="text-xs text-slate-500">每条启用公式会给某些号码加分或扣分，作为参考排序依据。</p>
                    </div>
                  </div>
                  <div className="mb-4 rounded-md border border-cyan-300/18 bg-cyan-300/[0.055] p-3 text-sm leading-6 text-cyan-50/85">
                    {candidateReport.riskNotice}
                  </div>
                  {candidateReport.signals.length === 0 ? (
                    <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-500">暂无公式依据。请检查公式是否已启用、可计算且未被手动排除。</p>
                  ) : (
                    <div className="rq-signal-table rq-scrollbar">
                      {candidateReport.signals.map((signal, index) => (
                      <div key={`${signal.ruleId}-${signal.action}-${index}`} className="rq-signal-row">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h4 className="min-w-0 break-words font-medium text-white sm:truncate">{signal.ruleName}</h4>
                          <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0">
                            <Badge tone={sourceTypeTone(signal.sourceType)}>{sourceTypeLabel(signal.sourceType)}</Badge>
                            <Badge tone={signal.action === "include" ? "green" : "rose"}>{signal.action === "include" ? "支持" : "排除"}</Badge>
                          </div>
                        </div>
                        <p className="mt-2 font-mono text-xs text-cyan-100">{signal.formula}</p>
                        <p className="mt-2 text-sm text-slate-400">对象：{signal.targets.join("、")} · 权重 {signal.weight} · 历史 {signal.successRate}% · 近10期 {signal.recentRate}%</p>
                      </div>
                      ))}
                    </div>
                  )}
                </Panel>
                </section>
                )}
              </div>
            )}

            {activeView === "sample-check" && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
                <Panel className="p-5">
                  <h2 className="font-semibold text-white">公式校验</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">录入 TXT 手算样例后，系统会逐项检查变量取值、原始结果、归一化、映射结果和下期判断。不一致会标红，不能静默通过。</p>
                  <div className="mt-4 space-y-3">
                    <Label>规则</Label>
                    <Select aria-label="选择校验公式" value={sampleDraft.ruleId} onChange={(event) => setSampleDraft({ ...sampleDraft, ruleId: event.target.value })}>
                      {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
                    </Select>
                    <Label>期号</Label>
                    <Input value={sampleDraft.issue} onChange={(event) => setSampleDraft({ ...sampleDraft, issue: event.target.value })} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div><Label>手算 raw</Label><Input value={sampleDraft.expectedRawResult} onChange={(event) => setSampleDraft({ ...sampleDraft, expectedRawResult: event.target.value })} /></div>
                      <div><Label>手算归一</Label><Input value={sampleDraft.expectedFinalResult} onChange={(event) => setSampleDraft({ ...sampleDraft, expectedFinalResult: event.target.value })} /></div>
                    </div>
                    <Label>手算映射结果</Label>
                    <Input value={sampleDraft.expectedMappedResult} onChange={(event) => setSampleDraft({ ...sampleDraft, expectedMappedResult: event.target.value })} placeholder="鼠 或 6,7,8,9,0,1,3" />
                    <Label>手算验证结果</Label>
                    <Select aria-label="选择预期结果" value={sampleDraft.expectedSuccess} onChange={(event) => setSampleDraft({ ...sampleDraft, expectedSuccess: event.target.value })}>
                      <option value="true">通过</option>
                      <option value="false">失败</option>
                    </Select>
                    <Button variant="primary" onClick={saveSample}><Plus className="h-4 w-4" />加入样例</Button>
                  </div>
                </Panel>
                <Panel className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-white">校验结果</h2>
                      <p className="text-xs text-slate-500">不一致时按公式结果、归一化、映射、验证结果标出差异来源</p>
                    </div>
                    <Badge tone={sampleResults.some((result) => !result.passed) ? "rose" : "green"}>{sampleResults.length} 条样例</Badge>
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Metric label="已核对" value={passedRuleCount} tone="green" />
                    <Metric label="未做样例核对" value={pendingRuleCount} tone="yellow" />
                    <Metric label="不一致" value={ruleValidationSummaries.filter((summary) => summary.status === "mismatch").length} tone="rose" />
                  </div>
                  <div className="space-y-3">
                    {sampleResults.map((result) => (
                      <div key={result.caseId} className={cn("rounded-lg border p-4", result.passed ? "border-emerald-300/20 bg-emerald-300/5" : "border-rose-300/25 bg-rose-300/8")}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-white">{result.caseId}</span>
                          <Badge tone={result.passed ? "green" : "rose"}>{result.passed ? "通过" : "不一致"}</Badge>
                        </div>
                        {result.differences.map((diff) => (
                          <p key={diff.type} className="mt-2 text-sm text-rose-100">{diff.type}: 期望 {String(diff.expected)}，程序 {String(diff.actual)}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {activeView === "next-output" && (
              <Panel className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-white">下一期规则输出</h2>
                    <p className="text-xs text-slate-500">基于最新一期 {latestDraw?.issue ?? "-"} 生成所有启用规则的规则输出，仅为历史规则研究输出，不作为任何资金决策依据。</p>
                  </div>
                  <Button onClick={() => exportWorkbook({ next_output: nextOutputs.map((item) => ({ rule: item.rule.name, result: hasCalculation(item) ? item.calculation.mappedResult.join("、") : item.error })) }, "rulequant-next-output.xlsx")}>
                    <Download className="h-4 w-4" />导出 Excel
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {nextOutputs.map((item) => (
                    <div key={item.rule.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-white">{item.rule.name}</h3>
                          <p className="text-xs text-slate-500">{categoryLabel(item.rule.category)} · {item.rule.formula}</p>
                        </div>
                        <Badge tone="cyan">{hasCalculation(item) ? item.calculation.mappedResult.join("、") : "异常"}</Badge>
                      </div>
                      {hasCalculation(item) ? (
                        <div className="mt-3 space-y-1 text-xs text-slate-400">
                          {item.calculation.process.slice(0, 5).map((line) => <p key={line}>{line}</p>)}
                        </div>
                      ) : <p className="mt-3 text-sm text-rose-200">{item.error}</p>}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {activeView === "config" && (
              <ConfigEditor
                key={JSON.stringify(config)}
                config={config}
                updateConfig={store.updateConfig}
                resetSeed={store.resetSeed}
              />
            )}

            {activeView === "reports" && (
              <div className="rq-export-grid">
                <ExportTile icon={Database} title="开奖数据" desc="导出 CSV / Excel 格式的当前验证开奖数据" action={() => exportDrawsCsv(activeDraws)} />
                <ExportTile icon={Layers3} title="规则库备份" desc="保存当前全部规则，用于备份或迁移" action={() => exportJson(rules, "rulequant-rules.json")} />
                <ExportTile icon={FileDown} title="全部公式 Word (.docx)" desc="导出手机和电脑都能打开的标准 Word 文档，包含新增公式、统一排版、总览和逐条详情" action={() => exportRuleLibraryWord(rules)} />
                <ExportTile icon={Settings2} title="属性配置备份" desc="保存生肖、波色、五行和计算口径" action={() => exportJson(config, "rulequant-config.json")} />
                <ExportTile icon={BarChart3} title="回测 Excel" desc="导出每期计算过程、输出和验证结果" action={() => exportBacktestExcel(backtest)} />
                <ExportTile icon={Activity} title="候选池 Excel" desc="导出 Top 号码、Top 生肖和规则信号明细" action={() => exportCandidatePoolExcel(candidateReport)} />
                <ExportTile icon={FileDown} title="候选池 HTML" desc="生成可直接转发查看的规则共识候选池报告" action={() => exportCandidatePoolHtml(candidateReport)} />
                <ExportTile icon={TableProperties} title="综合推荐历史 Excel" desc="分工作表导出总览、Top8、Top12、Top18 和生肖明细，便于筛选复盘" action={() => exportReferenceHistoryExcel(resolvedReferenceHistory)} />
                <ExportTile icon={FileDown} title="综合推荐历史 Word (.docx)" desc="导出手机和电脑通用的标准 Word 文档，包含表格、命中标记和完整推荐记录" action={() => exportReferenceHistoryWord(resolvedReferenceHistory)} />
                <ExportTile icon={ClipboardCheck} title="综合推荐历史 TXT" desc="导出 UTF-8 文本文档，适合直接转发或保存，不会出现中文乱码" action={() => exportReferenceHistoryText(resolvedReferenceHistory)} />
                <ExportTile icon={ClipboardCheck} title="样例校验" desc="导出手算样例对比和差异类型" action={() => exportSampleReport(sampleResults)} />
                <ExportTile icon={FileDown} title="HTML 报告" desc="生成可直接打开的 HTML 回测报告" action={() => exportHtmlReport(backtest, rules, config)} />
              </div>
            )}

            {activeView === "help" && <RuleUnderstandingPage />}
          </div>
        </main>
      </div>
    </div>
  );
}

function OneClickResultCard({
  item,
  categoryLabel,
  onOpen,
}: {
  item: OneClickFormulaResult;
  categoryLabel: string;
  onOpen: () => void;
}) {
  return (
    <div className={cn("rq-one-click-row", item.error && "rq-one-click-row--error")}>
        <div className="rq-one-click-cell rq-one-click-cell--formula">
          <h4 className="font-medium text-white">{item.ruleName}</h4>
          <p className="mt-1 text-xs text-slate-500">{categoryLabel} · {item.orderMode}序</p>
        </div>
        <p className="rq-one-click-cell font-mono text-xs text-cyan-100">{item.formula}</p>
        <div className="rq-one-click-cell">
          <p className="font-mono text-xs text-slate-300">{item.equationLine}</p>
          <p className="mt-1 text-xs text-slate-500">{item.variableLine}</p>
        </div>
        <div className="rq-one-click-cell rq-one-click-cell--output">
          <p className="text-sm text-white">{item.finalOutputLabel}</p>
          <p className="mt-1 text-xs text-slate-500">{item.mappingLine}</p>
        </div>
        <Link href="/formula-detail" onClick={onOpen} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 text-xs text-slate-100 hover:bg-white/[0.09] sm:h-9">
          <Eye className="h-4 w-4" />查看明细
        </Link>
      {item.error && <p className="mt-3 text-sm text-rose-200">{item.error}</p>}
    </div>
  );
}

function DiscoveryDetailPanel({
  candidate,
  categoryLabel,
  onAdd,
  existingRule,
  draws,
  config,
}: {
  candidate?: FormulaDiscoveryCandidate;
  categoryLabel: string;
  onAdd: (candidate: FormulaDiscoveryCandidate) => void;
  existingRule?: RuleRecord;
  draws: DrawRecord[];
  config: ReturnType<typeof useRuleQuantStore.getState>["config"];
}) {
  const ledger = useMemo(() => (candidate ? buildFormulaLedger(candidate, { draws, config }) : undefined), [candidate, draws, config]);
  if (!candidate || !ledger) {
    return (
      <Panel className="p-5">
        <h3 className="font-semibold text-white">候选公式详情</h3>
        <p className="mt-3 text-sm text-slate-500">暂无候选公式。</p>
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">候选公式详情</h3>
          <p className="mt-1 text-sm text-slate-500">{categoryLabel} · 系统推荐公式</p>
        </div>
        <Badge tone="yellow">加入前需人工确认</Badge>
      </div>
      <p className="mt-4 font-mono text-sm text-cyan-100">{candidate.rule.formula}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-slate-500">训练期表现</p>
          <p className="mt-1 font-mono text-[20px] text-white">{candidate.trainingRate}%</p>
          <p className="mt-1 text-xs text-slate-500">{candidate.trainingResult.total} 期</p>
        </div>
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-slate-500">验证期表现</p>
          <p className="mt-1 font-mono text-[20px] text-white">{candidate.validationRate}%</p>
          <p className="mt-1 text-xs text-slate-500">{candidate.validationResult.total} 期</p>
        </div>
        <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-3">
          <p className="text-slate-500">独立留出期</p>
          <p className="mt-1 font-mono text-[20px] text-white">{candidate.holdoutRate}%</p>
          <p className="mt-1 text-xs text-slate-500">{candidate.holdoutResult.total} 期</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-4">
        <span>总验证 {candidate.total}</span>
        <span>近10期 {candidate.recentRate}%</span>
        <span>当前连对 {candidate.currentStreak}</span>
        <span>稳定差 {candidate.stabilityGap}</span>
      </div>
      <p className="mt-3 text-xs text-rose-200">明确错期：{candidate.failedIssues.slice(0, 12).join("、") || "暂无"}</p>
      <p className="mt-3 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs leading-5 text-slate-400">
        加减公式出现负的原始值时，规则引擎会按目标范围闭环归一化；综合计算只使用归一化后的有效结果。
      </p>
      {existingRule ? (
        <div className="mt-4 grid gap-2">
          <Button className="w-full" disabled variant="secondary"><CheckCircle2 className="h-4 w-4" />已加入公式库</Button>
          <Link href="/rules" onClick={() => useRuleQuantStore.getState().setSelectedRule(existingRule.id)} className="inline-flex h-10 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm text-cyan-50 hover:bg-cyan-300/16">
            去公式管理查看
          </Link>
        </div>
      ) : (
        <Button className="mt-4 w-full" variant="primary" onClick={() => onAdd(candidate)}><Plus className="h-4 w-4" />确认并加入公式库</Button>
      )}
      <div className="mt-5 max-h-[480px] space-y-3 overflow-auto pr-2">
        {ledger.entries.slice(-12).reverse().map((entry) => <FormulaLedgerRow key={`${candidate.rule.id}-${entry.currentIssue}`} entry={entry} />)}
      </div>
    </Panel>
  );
}

function FormulaLedgerRow({ entry }: { entry: FormulaLedgerEntry }) {
  return (
    <div className={cn(
      "rounded-lg border p-4",
      entry.isPending
        ? "border-amber-300/30 bg-amber-300/8"
        : entry.isFailure
          ? "border-rose-300/30 bg-rose-300/8"
          : "border-emerald-300/20 bg-emerald-300/5",
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-white">{entry.currentIssue}期</span>
            <Badge tone={entry.isPending ? "yellow" : entry.isFailure ? "rose" : "green"}>{entry.statusText} {entry.statusIcon}</Badge>
            {entry.rawResult < 0 && <Badge tone="cyan">已闭环转为有效结果</Badge>}
            <span className="text-xs text-slate-500">当前开奖：{entry.currentNumbersLabel}</span>
          </div>
          <p className="mt-3 font-mono text-sm text-cyan-100">{entry.equationLine}</p>
          <p className="mt-2 text-sm text-slate-300">{entry.mappingLine}，本期公式结果：{entry.finalOutputLabel}</p>
          <p className="mt-2 text-sm text-slate-300">{entry.nextOpenLabel}</p>
        </div>
        {entry.isPending ? <Activity className="h-6 w-6 shrink-0 text-amber-300" /> : entry.isFailure ? <XCircle className="h-6 w-6 shrink-0 text-rose-300" /> : <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-300" />}
      </div>
      <details className="mt-3 rounded-md border border-white/[0.06] bg-black/20 p-3">
        <summary className="cursor-pointer text-sm text-slate-300">展开变量取值和处理过程</summary>
        <div className="mt-3 space-y-2 text-xs text-slate-400">
          <p>公式原文：{entry.formula}</p>
          <p>变量取值：{entry.variableLine}</p>
          <p>原始算式值：{entry.rawResult}{entry.rawResult < 0 ? "（仅保留用于核对，不直接参与映射）" : ""}</p>
          <p>结果处理：{entry.processingLine || "-"}</p>
          <p className="text-slate-300">{entry.compactLine}</p>
        </div>
      </details>
    </div>
  );
}

type BuilderMode = "paste" | "template" | "advanced";
type BuilderIntent = "include_zodiac" | "kill_zodiac" | "seven_tail" | "six_zodiac" | "eight_zodiac" | "nine_zodiac" | "kill_tail" | "kill_sum";
type BuilderValueKind = "number" | "head" | "tail" | "sum" | "sumTail" | "segment" | "element" | "color" | "parity" | "size";

const builderIntentOptions: Array<{ value: BuilderIntent; label: string; hint: string }> = [
  { value: "include_zodiac", label: "选生肖", hint: "公式算出一个生肖，作为支持信号" },
  { value: "kill_zodiac", label: "杀生肖", hint: "公式算出一个生肖，作为排除信号" },
  { value: "seven_tail", label: "七尾", hint: "按定位尾数做 0-9 闭环偏移" },
  { value: "six_zodiac", label: "取六肖", hint: "按平码位置循环加减，生成一组生肖候选" },
  { value: "eight_zodiac", label: "八肖起点", hint: "从定位生肖扩展成八肖候选" },
  { value: "nine_zodiac", label: "九肖自用", hint: "按 +1234567911 这类取值扩展九肖" },
  { value: "kill_tail", label: "杀尾", hint: "公式算出一个尾数，作为排除信号" },
  { value: "kill_sum", label: "杀合", hint: "公式算出一个合数，作为排除信号" },
];

const builderValueOptions: Array<{ value: BuilderValueKind; label: string }> = [
  { value: "number", label: "号码本身" },
  { value: "head", label: "头" },
  { value: "tail", label: "尾" },
  { value: "sum", label: "合" },
  { value: "sumTail", label: "合尾" },
  { value: "segment", label: "段" },
  { value: "element", label: "五行值" },
  { value: "color", label: "波色值" },
  { value: "parity", label: "单双" },
  { value: "size", label: "大小" },
];

function positionLabel(position: number) {
  return position === 7 ? "特码" : `第${position}位`;
}

function positionVariable(position: number) {
  return position === 7 ? "特码" : `平${position}`;
}

function valueVariable(position: number, kind: BuilderValueKind) {
  const base = positionVariable(position);
  switch (kind) {
    case "head":
      return `${base}头`;
    case "tail":
      return `${base}尾`;
    case "sum":
      return `${base}合`;
    case "sumTail":
      return `${base}合尾`;
    case "segment":
      return `${base}段`;
    case "element":
      return `${base}五行值`;
    case "color":
      return `${base}波色值`;
    case "parity":
      return `${base}单双`;
    case "size":
      return `${base}大小`;
    default:
      return base;
  }
}

function buildFormulaText(position: number, kind: BuilderValueKind, offset: number) {
  const base = valueVariable(position, kind);
  if (!offset) return base;
  return `${base} ${offset > 0 ? "+" : "-"} ${Math.abs(offset)}`;
}

function normalizeTailOffsetText(text: string) {
  const cleaned = text.replace(/[，、\s]+/g, ",").replace(/^\+/, "");
  return cleaned || "-3,-2,-1,0,1,2,4";
}

function parseCompactOffsetText(text: string): number[] {
  const source = text.trim();
  if (!source) return [];
  if (/^[+]?\d+$/.test(source)) {
    const compact = source.replace(/[^\d]/g, "");
    if (compact === "1234567911") return [1, 2, 3, 4, 5, 6, 7, 9, 11];
    const offsets: number[] = [];
    let index = 0;
    while (index < compact.length) {
      const two = compact.slice(index, index + 2);
      const requiredPrevious = two === "10" ? 9 : two === "11" ? 10 : two === "12" ? 11 : undefined;
      if (requiredPrevious !== undefined && offsets.includes(requiredPrevious)) {
        offsets.push(Number(two));
        index += 2;
      } else {
        offsets.push(Number(compact[index]));
        index += 1;
      }
    }
    return offsets;
  }
  return [...source.matchAll(/[+-]?\d+/g)].map((match) => Number(match[0])).filter(Number.isFinite);
}

function formatOffsetList(offsets: number[]) {
  return offsets.map((offset) => String(offset)).join(",");
}

function normalizeZodiacSetOffsetText(text: string) {
  const offsets = parseCompactOffsetText(text);
  return offsets.length ? formatOffsetList(offsets) : "0,1,2,3,4,8";
}

function normalizerForBuilder(intent: BuilderIntent, tailMode: string, customTailOffsets: string, zodiacOffsets: string) {
  if (intent === "seven_tail") {
    if (tailMode === "left2right4") return "tail_window:left=2,right=4";
    if (tailMode === "custom") return `tail_offsets:${normalizeTailOffsetText(customTailOffsets)}`;
    return "tail_window:left=3,right=3";
  }
  if (intent === "six_zodiac") return `zodiac_set_offsets:${normalizeZodiacSetOffsetText(zodiacOffsets)}`;
  if (intent === "nine_zodiac") return `zodiac_offsets:${zodiacOffsets || "+1234567911"}`;
  return "auto";
}

function targetForBuilder(intent: BuilderIntent) {
  if (intent === "kill_tail" || intent === "seven_tail") return "special_tail";
  if (intent === "kill_sum") return "special_sum";
  return "special_zodiac";
}

function builderName(intent: BuilderIntent, position: number, valueKind: BuilderValueKind) {
  const intentLabel = builderIntentOptions.find((item) => item.value === intent)?.label ?? "新增规则";
  const valueLabel = builderValueOptions.find((item) => item.value === valueKind)?.label ?? "号码本身";
  return `${positionLabel(position)}${valueLabel}${intentLabel}`;
}

function inferRuleText(rawText: string, currentIssue?: string) {
  const text = rawText.trim();
  const positionPatternText = text.match(/取\s*平\s*([1-7.\s]+)(?:循环)?/u)?.[1]
    ?? text.match(/平\s*([1-7]+(?:\.[1-7]+)+)/u)?.[1]
    ?? "";
  const inferredPositionPattern = parsePositionPattern(positionPatternText);
  const zodiacSetOffsets = text.match(/[+＋]\s*([0-9,\s.]+)/u)?.[1];
  const isSixZodiacText = /六肖/.test(text) || /取\s*平\s*[1-7.\s]+/u.test(text);
  const positionMatch = text.match(/(?:平(?:码)?|第)\s*([1-7])|特码|特号|特/);
  const position = inferredPositionPattern[0] ?? (positionMatch?.[1] ? Number(positionMatch[1]) : /特码|特号|特/.test(text) ? 7 : 1);
  const compactOffsets = text.match(/取值\s*([+-]?\d+)/);
  const isZodiacOffsetText = !isSixZodiacText && (/九肖/.test(text) || Boolean(compactOffsets && compactOffsets[1].replace(/\D/g, "").length >= 2));
  const offsetMatch = text.match(/([+-])\s*(\d+)/);
  const offset = isZodiacOffsetText ? 0 : offsetMatch ? Number(`${offsetMatch[1]}${offsetMatch[2]}`) : 0;
  const leftRight = text.match(/左\s*(\d+)\s*右\s*(\d+)/);
  const bothSide = text.match(/左右各\s*(\d+)/);
  const issueNumbers = [...text.matchAll(/(?:20)?(\d{3})/g)].map((match) => Number(match[1]));
  const currentSuffix = currentIssue ? Number(currentIssue.replace(/\D/g, "").slice(-3)) : undefined;
  const verifyOffset = issueNumbers.length >= 2 ? Math.max(1, issueNumbers[1] - issueNumbers[0]) : issueNumbers.length === 1 && currentSuffix ? Math.max(1, issueNumbers[0] - currentSuffix) : 1;
  const intent: BuilderIntent = isSixZodiacText
    ? "six_zodiac"
    : /七尾|尾数|左右/.test(text)
      ? "seven_tail"
      : isZodiacOffsetText
      ? "nine_zodiac"
      : /八肖/.test(text)
        ? "eight_zodiac"
        : /杀.*尾/.test(text)
          ? "kill_tail"
          : /杀.*合/.test(text)
            ? "kill_sum"
            : /杀/.test(text)
              ? "kill_zodiac"
              : "include_zodiac";
  const leftRightOffsets = leftRight
    ? Array.from({ length: Number(leftRight[1]) + Number(leftRight[2]) + 1 }, (_, index) => index - Number(leftRight[1])).join(",")
    : undefined;
  return {
    position,
    offset,
    intent,
    verifyOffset,
    tailMode: leftRight ? "left2right4" : bothSide ? "window3" : /七尾|尾数|左右/.test(text) ? "custom" : "window3",
    customTailOffsets: leftRightOffsets ?? (bothSide ? Array.from({ length: Number(bothSide[1]) * 2 + 1 }, (_, index) => index - Number(bothSide[1])).join(",") : "-3,-2,-1,0,1,2,4"),
    zodiacOffsets: isSixZodiacText && zodiacSetOffsets
      ? normalizeZodiacSetOffsetText(zodiacSetOffsets)
      : isZodiacOffsetText && compactOffsets?.[1]
        ? (compactOffsets[1].startsWith("+") || compactOffsets[1].startsWith("-") ? compactOffsets[1] : `+${compactOffsets[1]}`)
        : "+1234567911",
    positionPattern: inferredPositionPattern.join(","),
  };
}

function NewRuleBuilder({
  onSave,
  draw,
  config,
  periodIndex,
}: {
  onSave: (formData: FormData) => Promise<RuleSaveResult>;
  draw?: ReturnType<typeof normalizeDraw>;
  config: RuleQuantConfig;
  periodIndex?: number;
}) {
  const [mode, setMode] = useState<BuilderMode>("paste");
  const [rawText, setRawText] = useState("平码3虎05取值+1234567911");
  const [intent, setIntent] = useState<BuilderIntent>("nine_zodiac");
  const [position, setPosition] = useState(3);
  const [valueKind, setValueKind] = useState<BuilderValueKind>("number");
  const [offset, setOffset] = useState(0);
  const [tailMode, setTailMode] = useState("window3");
  const [customTailOffsets, setCustomTailOffsets] = useState("-3,-2,-1,0,1,2,4");
  const [zodiacOffsets, setZodiacOffsets] = useState("+1234567911");
  const [verifyOffset, setVerifyOffset] = useState(1);
  const [positionPattern, setPositionPattern] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  function applyRawText() {
    const inferred = inferRuleText(rawText, draw?.issue);
    setIntent(inferred.intent);
    setPosition(inferred.position);
    setOffset(inferred.offset);
    setTailMode(inferred.tailMode);
    setCustomTailOffsets(inferred.customTailOffsets);
    setZodiacOffsets(inferred.zodiacOffsets);
    setVerifyOffset(inferred.verifyOffset);
    setPositionPattern(inferred.positionPattern);
    if (!ruleName) setRuleName(builderName(inferred.intent, inferred.position, valueKind));
  }

  const formula = buildFormulaText(position, valueKind, offset);
  const normalizer = normalizerForBuilder(intent, tailMode, customTailOffsets, zodiacOffsets);
  const target = targetForBuilder(intent);
  const resolvedName = ruleName.trim() || builderName(intent, position, valueKind);
  const selectedZodiacOffsets = useMemo(() => parseCompactOffsetText(zodiacOffsets), [zodiacOffsets]);

  function toggleZodiacOffset(value: number) {
    const current = selectedZodiacOffsets;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((a, b) => a - b);
    setZodiacOffsets(formatOffsetList(next));
  }

  const formData = useMemo(() => {
    const data = new FormData();
    data.set("name", resolvedName);
    data.set("category", intent);
    data.set("orderMode", "L");
    data.set("formula", formula);
    data.set("normalizer", normalizer);
    data.set("target", target);
    data.set("periodSpan", String(Math.max(1, verifyOffset)));
    data.set("verifyOffset", String(Math.max(1, verifyOffset)));
    data.set("positionPattern", positionPattern);
    data.set("sourceType", "manual");
    data.set("sourceFile", mode === "paste" ? "粘贴原文识别" : "常用模板添加");
    data.set("description", rawText ? `原文：${rawText}` : "通过新增规则页面生成");
    data.set("tags", "新增规则");
    data.set("enabled", "on");
    data.set("manuallyConfirmed", "on");
    data.set("participatesInReference", "on");
    return data;
  }, [resolvedName, intent, formula, normalizer, target, verifyOffset, positionPattern, mode, rawText]);

  const trial = useMemo(() => {
    if (!draw) return { error: "暂无可试算开奖数据" } as const;
    try {
      const rule = buildRuleFromFormData(formData, { forceNew: true });
      const calculation = runRuleCalculation(rule, draw, config, { periodIndex });
      return { rule, calculation } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  }, [formData, draw, config, periodIndex]);

  async function save() {
    if ("error" in trial) {
      setSaveStatus(`暂不能保存：${trial.error}`);
      return;
    }
    const result = await onSave(formData);
    setSaveStatus(result.message);
  }

  if (mode === "advanced") {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr]">
        <Panel className="p-5">
          <h2 className="font-semibold text-white">创建方式</h2>
          <div className="mt-4 grid gap-2">
            {(["paste", "template", "advanced"] as BuilderMode[]).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} className={cn("rounded-lg border px-3 py-3 text-left text-sm", mode === item ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-50" : "border-white/[0.08] bg-white/[0.03] text-slate-300")}>
                {item === "paste" ? "粘贴原文识别" : item === "template" ? "常用模板添加" : "高级编辑"}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">高级编辑保留旧公式输入方式，普通新增规则建议用前两个入口。</p>
        </Panel>
        <RuleForm selectedRule={undefined} onSave={onSave} compact draw={draw} config={config} periodIndex={periodIndex} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-white">规则内容</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">普通用户只需要粘贴原文或选模板；平/落/特码这些同义词由系统内部统一处理。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-md border border-white/[0.07] bg-black/15 p-1">
            {(["paste", "template", "advanced"] as BuilderMode[]).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} className={cn("h-11 rounded px-3 text-xs font-medium transition sm:h-10", mode === item ? "bg-cyan-300/14 text-cyan-50" : "text-slate-400 hover:bg-white/[0.05] hover:text-white")}>
                {item === "paste" ? "原文识别" : item === "template" ? "模板添加" : "高级"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 break-words rounded-md border border-cyan-300/15 bg-cyan-300/[0.05] p-3 text-xs leading-5 text-cyan-50/85">
          已简化：第1位=平1=落1，特码=平7=落7=特号；合尾=合数尾，五行值=行，波色值=波。页面只显示一种说法。
        </div>
        <div className="mt-5">
          {mode === "paste" ? (
          <div>
            <h3 className="font-semibold text-white">粘贴原文识别</h3>
            <p className="mt-1 text-sm text-slate-500">例如：平码3虎05取值+1234567911，或 176特码10 预测178尾数左右各3。</p>
            <Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} className="mt-4 min-h-28 sm:min-h-32" />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
              <Button className="w-full sm:w-auto" type="button" onClick={applyRawText}><Search className="h-4 w-4" />开始理解</Button>
              <Button className="w-full sm:w-auto xl:hidden" variant="primary" type="button" disabled={"error" in trial} onClick={() => void save()}><Save className="h-4 w-4" />保存规则</Button>
            </div>
            {saveStatus && <p className={cn("mt-3 text-sm xl:hidden", saveStatus.includes("失败") || saveStatus.includes("暂不能") || saveStatus.includes("已存在") ? "text-rose-100" : "text-emerald-100")}>{saveStatus}</p>}
          </div>
          ) : (
          <div>
            <h3 className="font-semibold text-white">常用模板添加</h3>
            <p className="mt-1 text-sm text-slate-500">选择规则用途、位置和取值方式，系统自动生成内部公式。</p>
          </div>
          )}
        </div>

        <div className="mt-5 rounded-md border border-cyan-300/20 bg-cyan-300/[0.055] p-4 xl:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-cyan-100">当前机器理解</p>
              <p className="mt-1 text-sm leading-6 text-slate-200">取{positionLabel(position)}的{builderValueOptions.find((item) => item.value === valueKind)?.label}，{offset ? `执行 ${offset > 0 ? "+" : ""}${offset}` : "不加减"}，用于{builderIntentOptions.find((item) => item.value === intent)?.label}。</p>
              {"error" in trial ? (
                <p className="mt-2 text-xs text-rose-200">{trial.error}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">本期输出：<span className="text-white">{trial.calculation.mappedResult.join("、")}</span></p>
              )}
            </div>
            <Badge tone={"error" in trial ? "rose" : "green"}>{"error" in trial ? "待修正" : "可保存"}</Badge>
          </div>
          <Button className="mt-4 w-full" variant="primary" type="button" disabled={"error" in trial} onClick={() => void save()}><Save className="h-4 w-4" />保存到规则库</Button>
          {saveStatus && <p className={cn("mt-3 text-sm", saveStatus.includes("失败") || saveStatus.includes("暂不能") || saveStatus.includes("已存在") ? "text-rose-100" : "text-emerald-100")}>{saveStatus}</p>}
        </div>

        <details className="mt-5 rounded-md border border-white/[0.08] bg-white/[0.03] p-4">
          <summary className="cursor-pointer text-sm font-medium text-cyan-100">修改识别结果</summary>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>规则名称</Label>
              <Input value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder={resolvedName} />
            </div>
            <div>
              <Label>规则用途</Label>
              <Select aria-label="选择规则用途" value={intent} onChange={(event) => setIntent(event.target.value as BuilderIntent)}>
                {builderIntentOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>取哪个位置</Label>
              <Select aria-label="选择号码位置" value={String(position)} onChange={(event) => setPosition(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((item) => <option key={item} value={item}>{positionLabel(item)}</option>)}
              </Select>
            </div>
            <div>
              <Label>取什么值</Label>
              <Select aria-label="选择取值方式" value={valueKind} onChange={(event) => setValueKind(event.target.value as BuilderValueKind)}>
                {builderValueOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>加减计算</Label>
              <Input type="number" value={offset} onChange={(event) => setOffset(Number(event.target.value || 0))} />
            </div>
            <div>
              <Label>验证间隔</Label>
              <Input type="number" min={1} max={8} value={verifyOffset} onChange={(event) => setVerifyOffset(Number(event.target.value || 1))} />
            </div>
          </div>

          {intent === "seven_tail" && (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
              <div>
                <Label>七尾闭环方式</Label>
                <Select aria-label="选择尾数模式" value={tailMode} onChange={(event) => setTailMode(event.target.value)}>
                  <option value="window3">以尾数为中心左右各3</option>
                  <option value="left2right4">左2右4</option>
                  <option value="custom">自定义偏移</option>
                </Select>
              </div>
              <div>
                <Label>自定义偏移</Label>
                <Input value={customTailOffsets} onChange={(event) => setCustomTailOffsets(event.target.value)} placeholder="-3,-2,-1,0,1,2,4" />
              </div>
            </div>
          )}

          {(intent === "nine_zodiac" || intent === "six_zodiac") && (
            <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/15 p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 flex-1">
                  <Label>{intent === "six_zodiac" ? "生肖偏移（点几个就是几肖）" : "九肖取值"}</Label>
                  <Input value={zodiacOffsets} onChange={(event) => setZodiacOffsets(event.target.value)} placeholder={intent === "six_zodiac" ? "例如 012348" : "+1234567911"} />
                </div>
                <Badge tone="cyan">已选 {selectedZodiacOffsets.length} 个</Badge>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-9 xl:grid-cols-[repeat(13,minmax(0,1fr))]">
                {Array.from({ length: 25 }, (_, index) => index - 12).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleZodiacOffset(item)}
                    className={cn(
                      "h-11 rounded-md border text-xs font-semibold transition sm:h-10",
                      selectedZodiacOffsets.includes(item)
                        ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-50"
                        : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    {item >= 0 ? `+${item}` : item}
                  </button>
                ))}
              </div>
              {intent === "six_zodiac" && <p className="mt-2 text-xs text-slate-500">例：取位循环填 3,2,1 或 平321.321，偏移填 0,1,2,3,4,8，就是平3+0、平2+1、平1+2、平3+3、平2+4、平1+8。</p>}
            </div>
          )}

          <div className="mt-4">
            <Label>取位循环（可选）</Label>
            <Input value={positionPattern} onChange={(event) => setPositionPattern(event.target.value)} placeholder="例如 平321.321、平1234567.1234567. 或 平7654321.7654321." />
          </div>
        </details>
      </Panel>

      <Panel className="p-5 2xl:sticky 2xl:top-28 2xl:self-start">
        <h3 className="font-semibold text-white">机器理解与试算</h3>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-slate-500">我理解为</p>
            <p className="mt-2">取 {positionLabel(position)} 的 {builderValueOptions.find((item) => item.value === valueKind)?.label}，执行 {offset ? `${offset > 0 ? "+" : ""}${offset}` : "不加减"}，用途是 {builderIntentOptions.find((item) => item.value === intent)?.label}。</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-slate-500">内部公式</p>
            <p className="mt-2 font-mono text-cyan-100">{formula}</p>
            <p className="mt-1 text-xs text-slate-500">归一化：{normalizer}</p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-slate-500">当前期试算</p>
            {"error" in trial ? (
              <p className="mt-2 text-rose-200">{trial.error}</p>
            ) : (
              <>
                <p className="mt-2 text-slate-400">{draw?.issue ?? "-"}期：{drawNumbersWithZodiac(draw, config)}</p>
                <p className="mt-2 font-mono text-cyan-100">{trial.calculation.expression} = {trial.calculation.rawResult}</p>
                <p className="mt-2 text-white">输出：{trial.calculation.mappedResult.join("、")}</p>
                {trial.calculation.secondaryMappedResult?.length ? <p className="mt-1 text-xs text-slate-500">对应号码：{trial.calculation.secondaryMappedResult.map((item) => typeof item === "number" ? numberWithZodiac(item, config) : item).join("、")}</p> : null}
              </>
            )}
          </div>
        </div>
        {saveStatus && (
          <div className={cn("mt-4 rounded-lg border p-3 text-sm", saveStatus.includes("失败") || saveStatus.includes("暂不能") || saveStatus.includes("已存在") ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100")}>
            {saveStatus}
            {!saveStatus.includes("失败") && !saveStatus.includes("暂不能") && !saveStatus.includes("已存在") && <Link href="/rules" className="ml-3 text-cyan-100 underline-offset-4 hover:underline">去公式管理查看</Link>}
          </div>
        )}
        <Button className="mt-4 w-full" variant="primary" type="button" onClick={() => void save()}><Save className="h-4 w-4" />保存到规则库</Button>
      </Panel>
    </div>
  );
}

function RuleForm({
  selectedRule,
  onSave,
  compact = false,
  draw,
  config,
  periodIndex,
}: {
  selectedRule?: RuleRecord;
  onSave: (formData: FormData) => Promise<RuleSaveResult>;
  compact?: boolean;
  draw?: ReturnType<typeof normalizeDraw>;
  config?: ReturnType<typeof useRuleQuantStore.getState>["config"];
  periodIndex?: number;
}) {
  const [formulaText, setFormulaText] = useState(selectedRule?.formula ?? "平1 + 特码尾");
  const [trialResult, setTrialResult] = useState<
    | { rule: RuleRecord; calculation: RuleCalculation; error?: never }
    | { error: string; rule?: never; calculation?: never }
    | null
  >(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saveStatus, setSaveStatus] = useState("");
  const variableGroups: Array<{ title: string; items: Array<{ label: string; value: string }> }> = [
    {
      title: "位置",
      items: [
        ...Array.from({ length: 6 }, (_, index) => ({ label: `第${index + 1}位`, value: `平${index + 1}` })),
        { label: "特码", value: "特码" },
      ],
    },
    {
      title: "取值",
      items: [
        ...Array.from({ length: 6 }, (_, index) => [
          { label: `第${index + 1}位头`, value: `平${index + 1}头` },
          { label: `第${index + 1}位尾`, value: `平${index + 1}尾` },
          { label: `第${index + 1}位合`, value: `平${index + 1}合` },
          { label: `第${index + 1}位合尾`, value: `平${index + 1}合尾` },
        ]).flat(),
        { label: "特码头", value: "特码头" },
        { label: "特码尾", value: "特码尾" },
        { label: "特码合", value: "特码合" },
        { label: "特码合尾", value: "特码合尾" },
      ],
    },
    {
      title: "段位",
      items: [...Array.from({ length: 6 }, (_, index) => ({ label: `第${index + 1}位段`, value: `平${index + 1}段` })), { label: "特码段", value: "特码段" }],
    },
    {
      title: "波色值",
      items: [
        ...Array.from({ length: 6 }, (_, index) => ({ label: `第${index + 1}位波色值`, value: `平${index + 1}波色值` })),
        { label: "特码波色值", value: "特码波色值" },
      ],
    },
    {
      title: "五行值",
      items: [
        ...Array.from({ length: 6 }, (_, index) => ({ label: `第${index + 1}位五行值`, value: `平${index + 1}五行值` })),
        { label: "特码五行值", value: "特码五行值" },
      ],
    },
    {
      title: "单双大小",
      items: [
        ...Array.from({ length: 6 }, (_, index) => ({ label: `第${index + 1}位单双`, value: `平${index + 1}单双` })),
        { label: "特码单双", value: "特码单双" },
        ...Array.from({ length: 6 }, (_, index) => ({ label: `第${index + 1}位大小`, value: `平${index + 1}大小` })),
        { label: "特码大小", value: "特码大小" },
      ],
    },
    {
      title: "总数期号",
      items: ["总数", "总数尾", "总数合", "期号", "期号尾", "期数尾", "期合", "期合尾"].map((item) => ({ label: item, value: item })),
    },
  ];

  function getCurrentFormData() {
    if (!formRef.current) return undefined;
    const formData = new FormData(formRef.current);
    formData.set("formula", formulaText);
    return formData;
  }

  function insertVariable(variable: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? formulaText.length;
    const end = textarea?.selectionEnd ?? formulaText.length;
    const next = `${formulaText.slice(0, start)}${variable}${formulaText.slice(end)}`;
    setFormulaText(next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function tryCalculateDraft() {
    if (!draw || !config) {
      setTrialResult({ error: "暂无可试算开奖数据。" });
      return;
    }
    const formData = getCurrentFormData();
    if (!formData) return;
    try {
      const rule = buildRuleFromFormData(formData, { existingRule: selectedRule, forceNew: !selectedRule });
      const calculation = runRuleCalculation(rule, draw, config, { periodIndex });
      setTrialResult({ rule, calculation });
    } catch (error) {
      setTrialResult({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = getCurrentFormData();
    if (!formData) return;
    if (draw && config) {
      try {
        const rule = buildRuleFromFormData(formData, { existingRule: selectedRule, forceNew: !selectedRule });
        runRuleCalculation(rule, draw, config, { periodIndex });
      } catch (error) {
        const message = `保存前检查失败：${error instanceof Error ? error.message : String(error)}`;
        setTrialResult({ error: message });
        setSaveStatus(message);
        return;
      }
    }
    const result = await onSave(formData);
    setSaveStatus(result.message);
    if (!result.ok) {
      setTrialResult({ error: result.message });
    }
  }

  return (
    <Panel className="p-5">
      <h2 className="font-semibold text-white">{selectedRule ? "编辑规则" : "新增规则"}</h2>
      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input type="hidden" name="id" defaultValue={selectedRule?.id ?? ""} />
        <div><Label>规则名</Label><Input name="name" defaultValue={selectedRule?.name ?? ""} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>类型</Label>
            <Select aria-label="选择公式类型" name="category" defaultValue={selectedRule?.category ?? "kill_zodiac"}>
              {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>序列</Label>
            <Select aria-label="选择号码顺序" name="orderMode" defaultValue={selectedRule?.orderMode ?? "L"}>
              <option value="L">L序</option>
              <option value="D">D序</option>
              <option value="custom">自定义</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>公式</Label>
          <Textarea ref={textareaRef} name="formula" value={formulaText} onChange={(event) => setFormulaText(event.target.value)} className={compact ? "min-h-24 font-mono" : "font-mono"} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={tryCalculateDraft}><Play className="h-4 w-4" />试算当前公式</Button>
            <Button variant="primary" type="submit"><Save className="h-4 w-4" />{selectedRule ? "保存修改" : "保存为新公式"}</Button>
          </div>
          {trialResult?.error && (
            <div className="mt-3 rounded-lg border border-rose-300/25 bg-rose-300/10 p-3 text-sm text-rose-100">
              {trialResult.error}
            </div>
          )}
          {saveStatus && (
            <div className={cn("mt-3 rounded-lg border p-3 text-sm", saveStatus.includes("失败") || saveStatus.includes("暂不能") || saveStatus.includes("已存在") ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100")}>
              {saveStatus}
              {!saveStatus.includes("失败") && !saveStatus.includes("暂不能") && !saveStatus.includes("已存在") && <Link href="/rules" className="ml-3 text-cyan-100 underline-offset-4 hover:underline">去公式管理查看</Link>}
            </div>
          )}
          {trialResult?.calculation && (
            <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-white">草稿试算</span>
                <Badge tone="cyan">{trialResult.calculation.mappedResult.join("、")}</Badge>
              </div>
              <p className="mt-2 font-mono text-cyan-100">{trialResult.calculation.expression}</p>
              <p className="mt-1 font-mono text-white">rawResult：{trialResult.calculation.rawResult}</p>
            </div>
          )}
          <details className={cn("mt-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-3", compact && "max-h-[760px] overflow-auto pr-1")}>
            <summary className="cursor-pointer text-sm font-medium text-slate-300">高级变量按钮</summary>
            <p className="mt-2 text-xs leading-5 text-slate-500">这里已经去掉重复同义词。显示“第1位”，内部仍插入引擎可识别的“平1”。</p>
            <div className="mt-3 space-y-3">
              {variableGroups.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 text-xs text-slate-500">{group.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((variable) => (
                      <button key={variable.value} type="button" onClick={() => insertVariable(variable.value)} className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white">
                        {variable.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>归一化</Label><Input name="normalizer" defaultValue={selectedRule?.normalizer ?? "auto"} /></div>
          <div><Label>目标</Label><Input name="target" defaultValue={selectedRule?.target ?? "special"} /></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>管期</Label><Input name="periodSpan" type="number" min={1} max={2} defaultValue={selectedRule?.periodSpan ?? 1} /></div>
          <div><Label>平位序列</Label><Input name="positionPattern" defaultValue={selectedRule?.positionPattern?.join(",") ?? ""} /></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>锚点期号</Label><Input name="anchorIssue" defaultValue={selectedRule?.anchorIssue ?? ""} placeholder="例如 2026169" /></div>
          <div><Label>锚点序列位置</Label><Input name="anchorPatternIndex" type="number" min={0} defaultValue={selectedRule?.anchorPatternIndex ?? ""} /></div>
        </div>
        <div><Label>位置含义</Label><Input name="positionMeaning" defaultValue={selectedRule?.positionMeaning ?? "1=平1，2=平2，7=特码"} /></div>
        <div><Label>标签</Label><Input name="tags" defaultValue={selectedRule?.tags?.join(" ") ?? ""} /></div>
        <div>
          <Label>公式来源</Label>
          <Select aria-label="选择公式来源" name="sourceType" defaultValue={selectedRule?.sourceType ?? "manual"}>
            {extendedSourceTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
        </div>
        {!compact && <div><Label>来源文件</Label><Input name="sourceFile" defaultValue={selectedRule?.sourceFile ?? "手动录入"} /></div>}
        {!compact && <div><Label>说明</Label><Textarea name="description" defaultValue={selectedRule?.description ?? ""} /></div>}
        {compact && (
          <>
            <input type="hidden" name="sourceFile" defaultValue={selectedRule?.sourceFile ?? "手动录入"} />
            <input type="hidden" name="description" defaultValue={selectedRule?.description ?? ""} />
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input name="enabled" type="checkbox" defaultChecked={selectedRule?.enabled ?? true} /> 启用规则
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input name="manuallyConfirmed" type="checkbox" defaultChecked={selectedRule?.manuallyConfirmed ?? false} /> 标记用户确认
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input name="participatesInReference" type="checkbox" defaultChecked={selectedRule?.participatesInReference !== false} /> 允许参与综合参考
        </label>
        <Button variant="primary" type="submit" className="w-full"><Save className="h-4 w-4" />{selectedRule ? "保存修改" : "保存为新公式"}</Button>
      </form>
      {!compact && trialResult?.error && (
        <div className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/10 p-4 text-sm text-rose-100">
          {trialResult.error}
        </div>
      )}
      {!compact && trialResult?.calculation && (
        <div className="mt-4 space-y-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">当前草稿试算结果</p>
              <p className="mt-1 text-xs text-slate-400">{draw?.issue ?? "-"} 期 · {trialResult.rule.name}</p>
            </div>
            <Badge tone="cyan">{trialResult.calculation.mappedResult.join("、")}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-white/[0.08] bg-black/20 p-3">
              <p className="text-slate-500">表达式</p>
              <p className="mt-1 font-mono text-cyan-100">{trialResult.calculation.expression}</p>
            </div>
            <div className="rounded-md border border-white/[0.08] bg-black/20 p-3">
              <p className="text-slate-500">rawResult</p>
              <p className="mt-1 font-mono text-white">{trialResult.calculation.rawResult}</p>
            </div>
          </div>
          <div className="rounded-md border border-white/[0.08] bg-black/20 p-3 text-xs text-slate-300">
            <p className="mb-2 text-slate-500">变量取值</p>
            <p className="font-mono">{Object.entries(trialResult.calculation.variables).map(([key, value]) => `${key}=${value}`).join(" / ") || "-"}</p>
          </div>
          <div className="rounded-md border border-white/[0.08] bg-black/20 p-3 text-xs text-slate-300">
            <p className="mb-2 text-slate-500">归一化与输出</p>
            <p>归一化过程：{trialResult.calculation.normalizerSteps.join(" -> ")}</p>
            <p>最终输出：{Array.isArray(trialResult.calculation.finalResult) ? trialResult.calculation.finalResult.join("、") : trialResult.calculation.finalResult}</p>
            <p>映射结果：{trialResult.calculation.mappedResult.join("、")}</p>
          </div>
        </div>
      )}
      {!compact && (
        <div className="mt-5 border-t border-white/[0.08] pt-4">
          <h3 className="mb-2 text-sm font-medium text-white">TXT 原文库</h3>
          <div className="max-h-40 space-y-1 overflow-auto text-xs text-slate-500">
            {rawRuleFiles.map((file) => <p key={file}>{file}</p>)}
          </div>
        </div>
      )}
    </Panel>
  );
}

function FormulaWorkbench({ rule, draw, config, periodIndex }: { rule: RuleRecord; draw?: ReturnType<typeof normalizeDraw>; config: ReturnType<typeof useRuleQuantStore.getState>["config"]; periodIndex?: number }) {
  const result = useMemo<{ calculation: RuleCalculation; error?: never } | { error: string; calculation?: never } | null>(() => {
    if (!draw) return null;
    try {
      return { calculation: runRuleCalculation(rule, draw, config, { periodIndex }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [rule, draw, config, periodIndex]);
  const calculation = result?.calculation;

  return (
    <Panel className="p-5">
      <h2 className="font-semibold text-white">单期试算</h2>
      <p className="text-sm text-slate-500">当前试算期：{draw?.issue ?? "-"}</p>
      {calculation ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
            <p className="text-xs text-slate-500">输出结果</p>
            <p className="mt-2 text-[28px] font-semibold leading-tight text-cyan-100">{calculation.mappedResult.join("、")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Panel className="p-4"><p className="text-slate-500">rawResult</p><p className="font-mono text-white">{calculation.rawResult}</p></Panel>
            <Panel className="p-4"><p className="text-slate-500">finalResult</p><p className="font-mono text-white">{Array.isArray(calculation.finalResult) ? calculation.finalResult.join("、") : calculation.finalResult}</p></Panel>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-white">计算过程</h3>
            <div className="space-y-2">
              {calculation.process.map((line) => (
                <div key={line} className="rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-xs text-slate-300">{line}</div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-rose-200">{result?.error ?? "暂无可试算数据"}</p>
      )}
    </Panel>
  );
}

function ProcessInspector({ detail }: { detail?: BacktestDetail }) {
  if (!detail) return null;
  return (
    <Panel className="p-5">
      <h2 className="font-semibold text-white">计算过程展开</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-2 text-sm text-slate-300">
          <p>当前期：{detail.currentIssue}</p>
          <p>L序：{detail.lOrder.join(" ")}</p>
          <p>D序：{detail.dOrder.join(" ")}</p>
          <p>下期期号：{detail.nextIssue}</p>
          <p>下期属性：{detail.nextSpecialAttributes ? `${detail.nextSpecialAttributes.zodiac} / ${detail.nextSpecialAttributes.color} / ${detail.nextSpecialAttributes.element}` : "-"}</p>
        </div>
        <div className="space-y-2">
          {detail.process.map((line) => <div key={line} className="rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-xs text-slate-300">{line}</div>)}
        </div>
      </div>
    </Panel>
  );
}

function CandidateNumberList({ items, focus, onFocus, compact = false }: { items: CandidateNumber[]; focus: CandidateFocus; onFocus: (focus: CandidateFocus) => void; compact?: boolean }) {
  return (
    <div className={cn("rq-candidate-grid", compact && "rq-candidate-grid--compact")}>
      {items.map((item, index) => {
        const active = focus?.type === "number" && focus.value === item.number;
        return (
          <button
            key={item.number}
            onClick={() => onFocus({ type: "number", value: item.number })}
            className={cn(
              "rq-candidate-tile",
              active && "rq-candidate-tile--active",
            )}
          >
            <span className="rq-candidate-rank">{String(index + 1).padStart(2, "0")}</span>
            <span className="rq-candidate-number">{padNumber(item.number)}</span>
            <span className="rq-candidate-zodiac">{item.zodiac}</span>
            <span className="rq-candidate-votes"><em>{item.score.toFixed(2)}分</em><b>支持 {item.supportCount}</b><i>反对 {item.opposeCount}</i></span>
          </button>
        );
      })}
    </div>
  );
}

function CandidateZodiacList({ items, focus, onFocus }: { items: CandidateZodiac[]; focus: CandidateFocus; onFocus: (focus: CandidateFocus) => void }) {
  return (
    <div className="rq-zodiac-grid">
      {items.map((item, index) => {
        const active = focus?.type === "zodiac" && focus.value === item.zodiac;
        return (
          <button
            key={item.zodiac}
            onClick={() => onFocus({ type: "zodiac", value: item.zodiac })}
            className={cn(
              "rq-zodiac-tile",
              active && "rq-zodiac-tile--active",
            )}
          >
            <span className="rq-candidate-rank">{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.zodiac}</strong>
            <span className="rq-zodiac-numbers">{item.numbers.map(candidateNumberLabel).join("  ")}</span>
            <span className="rq-candidate-votes"><em>{item.score.toFixed(2)}分</em><b>+{item.supportCount}</b><i>-{item.opposeCount}</i></span>
          </button>
        );
      })}
    </div>
  );
}

function isCandidateNumber(candidate: CandidateNumber | CandidateZodiac): candidate is CandidateNumber {
  return "number" in candidate;
}

function EvidenceList({ title, items, tone }: { title: string; items: CandidateEvidence[]; tone: "green" | "rose" }) {
  const primaryItems = items.slice(0, 3);
  const restItems = items.slice(3);
  const renderEvidence = (item: CandidateEvidence, index: number) => (
    <div key={`${item.ruleId}-${item.action}-${index}`} className="rounded-md border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm text-slate-200">{item.ruleName}</p>
        <span className="font-mono text-xs text-cyan-100">{item.scoreDelta > 0 ? "+" : ""}{item.scoreDelta}</span>
      </div>
      <p className="mt-1 font-mono text-xs text-cyan-100">{item.formula}</p>
      <p className="mt-1 text-xs text-slate-500">对象：{item.targets.join("、")} · 历史表现 {item.successRate}% · 近10期 {item.recentRate}%</p>
      <p className="mt-1 text-xs text-slate-500">来源：{sourceTypeLabel(item.sourceType)} · 用户提供：{(item.sourceType ?? "user_provided") === "user_provided" ? "是" : "否"} · 当前连对 {item.currentStreak} · 连错 {item.wrongStreak ?? 0}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400">查看公式过程</summary>
        <div className="mt-2 space-y-1">
          {item.process.slice(0, 6).map((line) => (
            <p key={line} className="font-mono text-xs text-slate-500">{line}</p>
          ))}
        </div>
      </details>
    </div>
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">{title}</h4>
        <Badge tone={tone}>{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <p className="rounded-md border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-slate-500">暂无对应证据</p>}
        {primaryItems.map(renderEvidence)}
        {restItems.length > 0 && (
          <details className="rounded-md border border-white/[0.06] bg-black/15 p-3">
            <summary className="cursor-pointer text-sm text-slate-300">查看全部 {items.length} 条证据</summary>
            <div className="mt-3 space-y-2">
              {restItems.map((item, index) => renderEvidence(item, index + 3))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function FormulaHealthPanel({
  rows,
  onToggleReserve,
  compact = false,
}: {
  rows: RuleHealthRow[];
  onToggleReserve: (ruleId: string) => void;
  compact?: boolean;
}) {
  const reserveCount = rows.filter((row) => row.status === "reserve" || row.status === "manual_reserve").length;
  const watchCount = rows.filter((row) => row.status === "watch").length;
  const visibleRows = compact ? rows.slice(0, 6) : rows.slice(0, 12);

  return (
    <Panel className="rq-formula-health p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">公式提醒 / 备选库</h3>
          <p className="mt-1 text-sm text-slate-500">错了会提示；连错较多且命中率不稳的公式建议放入备选库。备选库公式继续回测，只是暂不参与综合参考。</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Badge tone={watchCount ? "yellow" : "green"}>提醒 {watchCount}</Badge>
          <Badge tone={reserveCount ? "rose" : "green"}>备选 {reserveCount}</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {visibleRows.map((row) => {
          const tone = row.status === "keep" ? "green" : row.status === "watch" ? "yellow" : "rose";
          return (
            <div key={row.rule.id} className="rq-formula-health-row">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="line-clamp-2 break-words font-medium text-white">{row.rule.name}</p>
                  <Badge tone={tone}>{row.status === "keep" ? "保留" : row.status === "watch" ? "观察" : "备选建议"}</Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{row.reason}</p>
              </div>
              <span className={cn("rq-health-stat", row.wrongStreak > 0 && "rq-health-stat--warning")}><small>连错</small><strong>{row.wrongStreak}</strong></span>
              <span className="rq-health-stat rq-health-stat--success"><small>命中</small><strong>{row.result?.successRate ?? 0}%</strong></span>
              <Button size="sm" onClick={() => onToggleReserve(row.rule.id)}>
                {row.rule.participatesInReference === false ? "恢复参与" : "放入备选"}
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ManualCombinationPanel({
  rules,
  selectedRuleIds,
  setSelectedRuleIds,
  report,
  validationById,
}: {
  rules: RuleRecord[];
  selectedRuleIds: string[];
  setSelectedRuleIds: (ids: string[]) => void;
  report: CandidatePoolReport;
  validationById: Map<string, RuleValidationSummary>;
}) {
  const availableRules = rules.filter((rule) => canRuleParticipateInReference(rule, validationById.get(rule.id)));

  function toggle(ruleId: string) {
    setSelectedRuleIds(selectedRuleIds.includes(ruleId) ? selectedRuleIds.filter((id) => id !== ruleId) : [...selectedRuleIds, ruleId]);
  }

  return (
    <Panel className="rq-manual-combination p-5">
      <div className="rq-section-heading">
        <div>
          <h3 className="font-semibold text-white">手动公式组合查看号码</h3>
          <p className="mt-1 text-sm text-slate-500">手动勾选几条公式，单独查看这组公式合并后的参考号码和生肖。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setSelectedRuleIds(availableRules.slice(0, 10).map((rule) => rule.id))}>选择前10条</Button>
          <Button size="sm" onClick={() => setSelectedRuleIds([])}>清空</Button>
        </div>
      </div>
      <div className="rq-manual-combination__layout">
        <div className="rq-manual-rule-list rq-scrollbar">
          {availableRules.map((rule) => (
            <label key={rule.id} className="rq-manual-rule-option">
              <input type="checkbox" checked={selectedRuleIds.includes(rule.id)} onChange={() => toggle(rule.id)} />
              <span className="min-w-0 flex-1 truncate">{rule.name}</span>
              <Badge tone="slate">{categoryLabel(rule.category)}</Badge>
            </label>
          ))}
        </div>
        <div className="rq-manual-result">
          <div className="flex items-center justify-between">
            <div>
              <p className="rq-manual-result__eyebrow">自选计算</p>
              <p className="rq-manual-result__title">组合结果</p>
            </div>
            <Badge tone="cyan">使用 {report.ruleCount} 条</Badge>
          </div>
          <p className="rq-manual-result__label">号码 Top 18</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-9">
            {report.topNumbers18.map((item) => (
              <span key={item.number} className="rq-manual-number">
                {candidateNumberLabel(item)}
              </span>
            ))}
            {!report.topNumbers18.length && <span className="col-span-9 text-sm text-slate-500">请选择可参与的公式。</span>}
          </div>
          <p className="rq-manual-result__label">生肖 Top 9</p>
          <div className="rq-manual-zodiac-list">
            {report.topZodiacs9.map((item, index) => <span key={item.zodiac}><small>{index + 1}</small><b>{item.zodiac}</b></span>)}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ReferenceEmptyState() {
  return (
    <Panel className="p-6">
      <Badge tone="yellow">暂无可生成结果</Badge>
      <h3 className="mt-3 text-[20px] font-semibold text-white">当前没有可参与综合计算的公式</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        请检查公式是否已启用、变量是否能识别、计算是否报错，或是否被手动设置为不参与综合参考。没有公式依据时，系统不会展示 Top 号码或 Top 生肖，避免误导。
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/sample-check" className="inline-flex h-10 items-center justify-center rounded-lg border border-cyan-200/45 bg-cyan-300/18 px-4 text-sm font-medium text-cyan-50 hover:bg-cyan-300/28">
          查看样例核对
        </Link>
        <Link href="/rules" className="inline-flex h-10 items-center justify-center rounded-lg border border-white/12 bg-white/[0.07] px-4 text-sm font-medium text-white hover:bg-white/[0.11]">
          去公式管理
        </Link>
      </div>
    </Panel>
  );
}

function ObservationMetric({ label, hits, total, rate, tone }: { label: string; hits: number; total: number; rate: number; tone: "green" | "cyan" | "yellow" | "violet" }) {
  return (
    <div className={cn("rq-observation-metric", `rq-observation-metric--${tone}`)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        <Badge tone={tone}>{rate}%</Badge>
      </div>
      <p className="mt-2 font-mono text-[24px] font-semibold text-white">{hits}/{total}</p>
    </div>
  );
}

function ReferenceObservationPanel({ report }: { report: ReferenceObservationReport }) {
  const rows = [...report.items].reverse();
  return (
    <Panel className="rq-observation-panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-semibold text-white">综合推荐近10期观察</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            每一期都只用上一期以前的数据生成综合推荐，再拿本期开奖特码核对。这个是观察概率，不代表后面一定会中。
          </p>
        </div>
        <Badge tone="cyan">观察 {report.total}/{report.window} 期</Badge>
      </div>
      {report.total === 0 ? (
        <p className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-500">数据还不够，暂时不能观察最近10期综合推荐表现。</p>
      ) : (
        <>
          <div className="rq-observation-metrics">
            <ObservationMetric label="重点号码 Top8" hits={report.top8Hits} total={report.total} rate={report.top8Rate} tone="green" />
            <ObservationMetric label="次选号码 Top12" hits={report.top12Hits} total={report.total} rate={report.top12Rate} tone="cyan" />
            <ObservationMetric label="宽参考 Top18" hits={report.top18Hits} total={report.total} rate={report.top18Rate} tone="violet" />
            <ObservationMetric label="生肖 Top7" hits={report.zodiac7Hits} total={report.total} rate={report.zodiac7Rate} tone="yellow" />
            <ObservationMetric label="生肖 Top9" hits={report.zodiac9Hits} total={report.total} rate={report.zodiac9Rate} tone="yellow" />
          </div>
          <div className="rq-observation-list">
            {rows.map((item) => (
              <article key={item.issue} className="rq-observation-entry">
                <div className="rq-observation-entry__head">
                  <div className="rq-observation-entry__identity">
                    <span>{item.issue}期</span>
                    <strong>开 {padNumber(item.special)} {item.zodiac}</strong>
                    <small>用 {item.previousIssue ?? "-"} 期以前数据 · {item.ruleCount} 条公式 · {item.signalCount} 条证据</small>
                  </div>
                  <div className="rq-observation-entry__badges">
                    <Badge tone={item.hitNumberRank <= 18 ? "cyan" : "yellow"}>49码排第 {item.hitNumberRank} 位</Badge>
                  </div>
                </div>
                <div className="rq-observation-entry__body">
                  <div>
                    <ObservationResultLine label="Top8" values={item.top8Numbers.map(padNumber).join("、")} tone="number" hit={item.hitTop8} />
                    <ObservationResultLine label="Top12" values={item.top12Numbers.map(padNumber).join("、")} tone="number" hit={item.hitTop12} />
                    <ObservationResultLine label="Top18" values={item.top18Numbers.map(padNumber).join("、")} tone="number" hit={item.hitTop18} />
                  </div>
                  <div>
                    <ObservationResultLine label="生肖 Top7" values={item.top7Zodiacs.join("、")} tone="zodiac" hit={item.hitZodiac7} />
                    <ObservationResultLine label="生肖 Top9" values={item.top9Zodiacs.join("、")} tone="zodiac" hit={item.hitZodiac9} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function ReferenceHistoryNumberList({ items, config, limit }: { items: ReferenceHistoryNumber[]; config: RuleQuantConfig; limit?: number }) {
  const displayItems = limit ? items.slice(0, limit) : items;
  return (
    <div className="rq-history-number-list">
      {displayItems.map((item, index) => (
        <span
          key={`${item.number}-${index}`}
          className={cn(
            "rq-history-number",
            item.hit ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-50" : "border-white/[0.08] bg-white/[0.04] text-cyan-50",
          )}
          title={`${padNumber(item.number)} ${item.zodiac}，排名 ${item.rank}，支持 ${item.supportCount}，反对 ${item.opposeCount}`}
        >
          {item.rank ? `${item.rank}. ` : ""}{numberWithZodiac(item.number, config)}{item.hit ? " 命中" : ""}
        </span>
      ))}
      {limit && items.length > limit ? <span className="text-xs text-slate-500">+{items.length - limit}</span> : null}
      {!displayItems.length ? <span className="text-xs text-slate-500">暂无</span> : null}
    </div>
  );
}

function ReferenceHistoryZodiacList({ items }: { items: ReferenceHistoryZodiac[] }) {
  return (
    <div className="rq-history-zodiac-list">
      {items.map((item, index) => (
        <span
          key={`${item.zodiac}-${index}`}
          className={cn(
            "rq-history-zodiac",
            item.hit ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-50" : "border-violet-300/15 bg-violet-300/[0.07] text-violet-50",
          )}
          title={`${item.zodiac}，排名 ${item.rank}，支持 ${item.supportCount}，反对 ${item.opposeCount}`}
        >
          {item.rank ? `${item.rank}. ` : ""}{item.zodiac}{item.hit ? " 命中" : ""}
        </span>
      ))}
      {!items.length ? <span className="text-xs text-slate-500">暂无</span> : null}
    </div>
  );
}

function ReferenceHistoryHitSummary({ record }: { record: ResolvedReferenceHistoryItem }) {
  if (!record.actualSpecial) {
    return <Badge tone="yellow">等待下一期开奖</Badge>;
  }
  const rank = record.outcome?.hitNumberRank;
  const bandLabel = !rank ? "49码外" : rank <= 8 ? "Top8" : rank <= 12 ? "第9-12位" : rank <= 18 ? "第13-18位" : "第19-49位";
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone={rank && rank <= 18 ? "cyan" : "yellow"}>实际特码排第 {rank ?? "-"} 位 · {bandLabel}</Badge>
      <Badge tone={record.hitTop8 ? "green" : "rose"}>Top8{record.hitTop8 ? "中" : "未中"}</Badge>
      <Badge tone={record.hitTop12 ? "green" : "rose"}>Top12{record.hitTop12 ? "中" : "未中"}</Badge>
      <Badge tone={record.hitTop18 ? "green" : "rose"}>Top18{record.hitTop18 ? "中" : "未中"}</Badge>
      <Badge tone={record.hitZodiac7 ? "green" : "rose"}>肖7{record.hitZodiac7 ? "中" : "未中"}</Badge>
      <Badge tone={record.hitZodiac9 ? "green" : "rose"}>肖9{record.hitZodiac9 ? "中" : "未中"}</Badge>
    </div>
  );
}

function ReferenceHistoryPanel({
  records,
  config,
  onDelete,
  onClear,
  onExportJson,
  onExportExcel,
  onExportWord,
  onExportText,
}: {
  records: ResolvedReferenceHistoryItem[];
  config: RuleQuantConfig;
  onDelete: (recordId: string) => void;
  onClear: () => void;
  onExportJson: () => void;
  onExportExcel: () => void;
  onExportWord: () => void;
  onExportText: () => void;
}) {
  const [expandedId, setExpandedId] = useState(records[0]?.id ?? "");
  const [visibleCount, setVisibleCount] = useState(10);
  const visibleRecords = records.slice(0, visibleCount);
  const currentExpandedId = records.some((record) => record.id === expandedId) ? expandedId : records[0]?.id ?? "";

  return (
    <Panel className="rq-reference-history p-5">
      <div className="rq-reference-history__head">
        <div>
          <h3 className="font-semibold text-white">综合推荐档案</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            这里保存每次生成推荐时的完整快照：Top8、Top12、Top16、Top18 号码、全量49号码、生肖Top7/Top8/Top9、全量12生肖、公式数量、证据数量和后续开奖命中情况。它和上面的近10期观察不同，这里是实际保存下来的复盘记录。
          </p>
        </div>
        <div className="rq-reference-history__actions">
          <Button size="sm" disabled={!records.length} onClick={onExportJson}><FileJson className="h-4 w-4" />JSON</Button>
          <Button size="sm" disabled={!records.length} onClick={onExportExcel}><Download className="h-4 w-4" />Excel</Button>
          <Button size="sm" disabled={!records.length} onClick={onExportWord}><FileDown className="h-4 w-4" />Word</Button>
          <Button size="sm" disabled={!records.length} onClick={onExportText}><Download className="h-4 w-4" />文本</Button>
          <Button size="sm" variant="danger" disabled={!records.length} onClick={() => { if (window.confirm("确认清空全部综合推荐档案吗？此操作无法撤销。")) onClear(); }}>清空记录</Button>
        </div>
      </div>

      {!records.length ? (
        <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-4 text-sm text-slate-500">
          暂无保存记录。打开或重新生成综合参考结果后，系统会自动保存；也可以点击“保存本次推荐”手动保存。
        </div>
      ) : (
        <div className="rq-reference-history__list">
          {visibleRecords.map((record) => {
            const expanded = currentExpandedId === record.id;
            const actualDrawLabel = record.actualSpecial ? `${record.actualNextIssue}期：${numberWithZodiac(record.actualSpecial, config)}` : "待开奖";
            return (
              <article key={record.id} className={cn("rq-history-record", expanded && "is-expanded")}>
                <div className="rq-history-record__head">
                  <button type="button" className="rq-history-record__identity" onClick={() => setExpandedId(expanded ? "" : record.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={record.saveType === "manual" ? "cyan" : "green"}>{record.saveType === "manual" ? "手动保存" : "自动保存"}</Badge>
                      <span className="font-semibold text-white">{record.baseIssue ?? "-"} 期综合推荐</span>
                      <span className="text-xs text-slate-500">保存 {new Date(record.savedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                    </div>
                    <div className="rq-history-record__context">
                      <span><small>本期开奖记录</small><strong>{record.latestNumbers.map((number) => numberWithZodiac(number, config)).join("  ")}</strong></span>
                      <span><small>计算规模</small><strong>{record.ruleCount} 条公式 · {record.signalCount} 条证据</strong></span>
                      <span><small>后续开奖</small><strong>{actualDrawLabel}</strong></span>
                    </div>
                  </button>
                  <div className="rq-history-record__actions">
                    <ReferenceHistoryHitSummary record={record} />
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button size="sm" onClick={() => setExpandedId(expanded ? "" : record.id)}>{expanded ? "收起明细" : "展开明细"}</Button>
                      <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`确认删除 ${record.baseIssue ?? "这"} 期综合推荐档案吗？`)) onDelete(record.id); }}>删除</Button>
                    </div>
                  </div>
                </div>

                <div className="rq-history-record__spotlight">
                  <div className="rq-history-record__group">
                    <p>重点号码 Top8</p>
                    <ReferenceHistoryNumberList items={record.topNumbers8} config={config} />
                  </div>
                  <div className="rq-history-record__group">
                    <p>生肖 Top7</p>
                    <ReferenceHistoryZodiacList items={record.topZodiacs7} />
                  </div>
                </div>

                {expanded && (
                  <div className="rq-history-record__details">
                    <div className="rq-history-record__facts">
                      <div><p>数据来源</p><strong>{record.dataSourceLabel ?? "-"}</strong></div>
                      <div><p>开奖记录</p><strong>{record.recordCount} 期</strong></div>
                      <div><p>证据构成</p><strong>支持 {record.supportSignalCount ?? 0} / 排除 {record.opposeSignalCount ?? 0}</strong></div>
                      <div><p>49码命中位置</p><strong>{record.outcome?.hitNumberRank ? `实际特码排第 ${record.outcome.hitNumberRank} 位` : "待下一期开奖核对"}</strong></div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
                      <div>
                        <p className="mb-2 text-xs text-slate-500">Top8 号码</p>
                        <ReferenceHistoryNumberList items={record.topNumbers8} config={config} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-slate-500">Top12 号码</p>
                        <ReferenceHistoryNumberList items={record.topNumbers12} config={config} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-slate-500">Top16 号码</p>
                        <ReferenceHistoryNumberList items={record.topNumbers16} config={config} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-slate-500">Top18 号码</p>
                        <ReferenceHistoryNumberList items={record.topNumbers18} config={config} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <div>
                        <p className="mb-2 text-xs text-slate-500">生肖 Top7</p>
                        <ReferenceHistoryZodiacList items={record.topZodiacs7} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-slate-500">生肖 Top8</p>
                        <ReferenceHistoryZodiacList items={record.topZodiacs8} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-slate-500">生肖 Top9</p>
                        <ReferenceHistoryZodiacList items={record.topZodiacs9} />
                      </div>
                    </div>
                    <details className="rounded-md border border-white/[0.08] bg-black/15 p-3">
                      <summary className="cursor-pointer text-sm text-slate-300">查看全量 49 号码排序</summary>
                      <div className="mt-3">
                        <ReferenceHistoryNumberList items={record.allNumbers} config={config} />
                      </div>
                    </details>
                    <details className="rounded-md border border-white/[0.08] bg-black/15 p-3">
                      <summary className="cursor-pointer text-sm text-slate-300">查看全量 12 生肖排序</summary>
                      <div className="mt-3">
                        <ReferenceHistoryZodiacList items={record.allZodiacs} />
                      </div>
                    </details>
                    <details className="rounded-md border border-white/[0.08] bg-black/15 p-3">
                      <summary className="cursor-pointer text-sm text-slate-300">查看证据摘要</summary>
                      <div className="mt-3 grid gap-2">
                        {record.evidenceSummary.slice(0, 40).map((item, index) => (
                          <div key={`${item.ruleId}-${index}`} className="rounded-md border border-white/[0.06] bg-white/[0.025] p-2 text-xs text-slate-300">
                            <span className={item.action === "include" ? "text-emerald-200" : "text-rose-200"}>{item.action === "include" ? "支持" : "排除"}</span>
                            <span className="ml-2 text-white">{item.ruleName}</span>
                            <span className="ml-2 text-slate-500">{item.targetType}：{item.targets.join("、")} · 分 {item.scoreDelta} · 历史 {item.successRate}% · 近况 {item.recentRate}%</span>
                          </div>
                        ))}
                        {!record.evidenceSummary.length && <p className="text-xs text-slate-500">暂无证据摘要。</p>}
                        {record.evidenceSummary.length > 40 && <p className="text-xs text-slate-500">仅展示前 40 条，完整证据请导出 JSON/Excel。</p>}
                      </div>
                    </details>
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-md border border-white/[0.08] bg-black/20 p-3"><p className="text-slate-500">生成时间</p><p className="mt-1 text-white">{new Date(record.generatedAt).toLocaleString("zh-CN", { hour12: false })}</p></div>
                      <div className="rounded-md border border-white/[0.08] bg-black/20 p-3"><p className="text-slate-500">备注</p><p className="mt-1 text-white">{record.note ?? "-"}</p></div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {records.length > visibleRecords.length ? (
            <div className="flex justify-center pt-2">
              <Button onClick={() => setVisibleCount((count) => count + 10)}>再看 10 条记录</Button>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function CandidateEvidencePanel({ candidate }: { candidate?: CandidateNumber | CandidateZodiac }) {
  if (!candidate) {
    return (
      <Panel className="p-5">
        <h3 className="font-semibold text-white">证据面板</h3>
        <p className="mt-3 text-sm text-slate-500">暂无候选数据。</p>
      </Panel>
    );
  }

  const title = isCandidateNumber(candidate) ? candidateNumberLabel(candidate) : candidate.zodiac;
  const subtitle = isCandidateNumber(candidate)
    ? `${candidate.zodiac} · ${candidate.color} · ${candidate.element} · ${candidate.parity} · ${candidate.size} · 尾 ${candidate.tail}`
    : candidate.numbers.map(candidateNumberLabel).join("、");

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[22px] font-semibold leading-tight text-white">{title}</h3>
          <p className="mt-1 break-words text-sm leading-6 text-slate-500">{subtitle}</p>
        </div>
        <Badge className="w-fit" tone={candidate.opposeCount ? "slate" : "green"}>评分 {candidate.score}</Badge>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Panel className="p-3"><p className="text-slate-500">支持规则</p><p className="mt-1 font-mono text-[20px] text-white">{candidate.supportCount}</p></Panel>
        <Panel className="p-3"><p className="text-slate-500">反对规则</p><p className="mt-1 font-mono text-[20px] text-white">{candidate.opposeCount}</p></Panel>
      </div>
      <div className="mt-4 rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] p-3 text-sm leading-6 text-cyan-50">
        入选原因：综合分 {candidate.score}，支持证据 {candidate.supportCount} 条，反对证据 {candidate.opposeCount} 条；证据来自最新一期公式计算和公式历史表现，仅供公式研究和参考排序。
      </div>
      <div className="mt-5 space-y-5">
        <EvidenceList title="支持证据" items={candidate.supportRules} tone="green" />
        <EvidenceList title="反对证据" items={candidate.opposeRules} tone="rose" />
      </div>
    </Panel>
  );
}

function ExportTile({ icon: Icon, title, desc, action }: { icon: typeof Database; title: string; desc: string; action: () => void }) {
  return (
    <Panel className="rq-export-tile">
      <div className="rq-export-tile__icon"><Icon aria-hidden="true" /></div>
      <div className="min-w-0">
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{desc}</p>
      </div>
      <Button className="rq-export-tile__action" onClick={action}><Download className="h-4 w-4" />导出</Button>
    </Panel>
  );
}

function ObservationResultLine({ label, values, tone, hit }: { label: string; values: string; tone: "number" | "zodiac"; hit: boolean }) {
  return (
    <div className={cn("rq-observation-result-line", `rq-observation-result-line--${tone}`)}>
      <span>{label}</span>
      <strong>{values || "-"}</strong>
      <em className={hit ? "is-hit" : "is-miss"}>{hit ? "命中" : "未中"}</em>
    </div>
  );
}

function ConfigEditor({
  config,
  updateConfig,
  resetSeed,
}: {
  config: ReturnType<typeof useRuleQuantStore.getState>["config"];
  updateConfig: (config: ReturnType<typeof useRuleQuantStore.getState>["config"]) => Promise<void>;
  resetSeed: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"overview" | "tables" | "advanced" | "maintenance">("overview");

  function toggleAdvancedConfig() {
    if (!advancedOpen && !text) {
      setText(JSON.stringify(config, null, 2));
    }
    setSaveStatus("");
    setAdvancedOpen((current) => !current);
  }

  async function saveConfig() {
    try {
      const parsed = JSON.parse(text);
      await updateConfig(parsed);
      setError("");
      setSaveStatus("配置已保存并通过格式校验，后续计算将使用新配置。");
    } catch (saveError) {
      setSaveStatus("");
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  const tableGroups = settingsTab === "tables" ? [
    { title: "生肖号码表", entries: Object.entries(config.zodiacTable) },
    { title: "波色号码表", entries: Object.entries(config.colorTable) },
    { title: "五行号码表", entries: Object.entries(config.elementTable) },
  ] : [];

  return (
    <div className="rq-settings-workspace">
      <aside className="rq-settings-nav" aria-label="设置分类">
        {[
          ["overview", "基础规则", "常用规则口径"],
          ["tables", "属性表", "生肖、波色、五行"],
          ["advanced", "高级设置", "规则参数"],
          ["maintenance", "数据维护", "导出与重置"],
        ].map(([key, label, hint]) => (
          <button key={key} type="button" className={cn(settingsTab === key && "is-active")} onClick={() => setSettingsTab(key as typeof settingsTab)}><strong>{label}</strong><small>{hint}</small></button>
        ))}
      </aside>

      <Panel className="rq-settings-content p-5">
        {settingsTab === "overview" && <>
          <div className="rq-section-head"><div><p className="rq-eyebrow">基础规则</p><h2>当前计算口径</h2></div><Link href="/help" className="rq-link-button">完整规则说明</Link></div>
          <div className="rq-settings-summary-grid">
            <div><span>生肖顺序</span><strong>{config.zodiacOrder.join("、")}</strong></div>
            <div><span>七尾偏移</span><strong>{config.sevenTailOffsets.join(" / ")}</strong></div>
            <div><span>八肖取位序列</span><strong>{config.eightZodiacPattern.join("")}</strong></div>
            <div><span>杀三肖取位序列</span><strong>{config.killThreePattern.join("")}</strong></div>
          </div>
          <div className="rq-rule-principles">
            <p><b>01</b><span><strong>L序与 D序</strong>D序只排序 6 个平码，特码始终单独保留。</span></p>
            <p><b>02</b><span><strong>结果作用</strong>杀类是排除；七尾、八肖、九肖是候选支持。</span></p>
            <p><b>03</b><span><strong>参与规则</strong>已启用且可计算的公式可以参与，样例未核对不拦截。</span></p>
            <p><b>04</b><span><strong>不确定变量</strong>不猜测，标记待人工确认并显示原因。</span></p>
          </div>
        </>}

        {settingsTab === "tables" && <>
          <div className="rq-section-head"><div><p className="rq-eyebrow">属性表</p><h2>号码映射一览</h2><p>这里用于查看当前规则表；修改请进入高级配置并保存。</p></div></div>
          <div className="rq-attribute-tables rq-scrollbar">
            {tableGroups.map((group) => <section key={group.title}><h3>{group.title}</h3>{group.entries.map(([label, numbers]) => <div key={label}><strong>{label}</strong><span>{numbers.map((number) => String(number).padStart(2, "0")).join("  ")}</span></div>)}</section>)}
          </div>
        </>}

        {settingsTab === "advanced" && <>
          <div className="rq-section-head"><div><p className="rq-eyebrow">高级设置</p><h2>规则参数</h2><p>仅在需要调整生肖、波色、五行、段位或偏移序列时使用。</p></div><Button onClick={toggleAdvancedConfig}>{advancedOpen ? "收起参数" : "编辑参数"}</Button></div>
          {advancedOpen ? <Textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-5 min-h-[460px] font-mono text-sm" /> : <div className="rq-empty-copy mt-5">规则参数默认收起，日常使用无需修改。</div>}
          {advancedOpen && error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
          {advancedOpen && saveStatus && <p className="rq-save-confirmation mt-3" role="status">{saveStatus}</p>}
          {advancedOpen && <div className="mt-4 flex gap-2"><Button variant="primary" onClick={saveConfig}><Save className="h-4 w-4" />保存并校验</Button><Button onClick={() => exportJson(config, "rulequant-config.json")}><FileJson className="h-4 w-4" />导出参数备份</Button></div>}
        </>}

        {settingsTab === "maintenance" && <>
          <div className="rq-section-head"><div><p className="rq-eyebrow">数据维护</p><h2>备份与恢复</h2><p>危险操作集中在这里，避免日常使用时误触。</p></div></div>
          <div className="rq-maintenance-actions">
            <button type="button" onClick={() => exportJson(config, "rulequant-config.json")}><FileJson /><span><strong>导出当前配置</strong><small>保存为配置备份</small></span></button>
            <button type="button" className="is-danger" onClick={() => { if (window.confirm("确认恢复示例数据吗？当前本地修改会被替换。")) void resetSeed(); }}><RefreshCw /><span><strong>恢复示例数据</strong><small>此操作需要再次确认</small></span></button>
          </div>
        </>}
      </Panel>
    </div>
  );
}

function RuleUnderstandingPage() {
  const items = [
    ["Formula Engine", "唯一计算入口。公式计算、杀肖、杀合、七尾、八肖、九肖、逐期明细都必须从这里出来，其他模块不能另写一套算法。"],
    ["Signal System", "只负责把公式输出变成支持或排除信号，例如支持某生肖、排除某尾数、排除某波色。"],
    ["Scoring Engine", "只负责把支持/排除信号映射到 1-49 号码并打分；没有任何公式证据的号码不能进入 Top 结果。"],
    ["Aggregation", "只负责把 1-49 号码结果汇总成生肖 Top 7/8/9，不重新计算公式。"],
    ["UI 展示层", "页面只展示同步、计算结果、证据和逐期明细；除公式编辑器草稿试算外，不在页面里自行推导结果。"],
    ["参与计算", "公式主状态只有参与计算和不参与计算。来源、推荐、样例核对都是标签，不是参与门槛。"],
    ["开奖记录结构", "每期必须有平1、平2、平3、平4、平5、平6、特码，共 7 个号码。"],
    ["L序", "L序是原始落球顺序：平1到平6加特码。公式写 L序时，平1就是原始平1。"],
    ["D序", "D序只把 6 个平码从小到大排序，特码单独保留为第 7 位。页面表格排序和公式 D序不是一回事。"],
    ["特码", "特码必须单独保存。无论公式用 L序还是 D序，特码、特尾、特合、特行都取原始第 7 个号码。"],
    ["号码属性", "头=十位，尾=个位，合=十位+个位，合尾=合数个位，段位按 01-49 分 7 段。"],
    ["生肖表", "当前默认使用 2026 年生肖表，生肖顺序为马、蛇、龙、兔、虎、牛、鼠、猪、狗、鸡、猴、羊。"],
    ["波色和五行", "波色值为红=0、蓝=1、绿=2；五行值为金=1、木=2、水=3、火=4、土=5，可在设置里校验和修改。"],
    ["平码/平位/生肖位", "平三码、平四码、平3、平4 都是开奖号码本身；平3位、平4位是该号码对应生肖在固定十二生肖序里的位置：鼠1、牛2、虎3、兔4、龙5、蛇6、马7、羊8、猴9、鸡10、狗11、猪12。单独写“位/平位/定位”才算未锁定变量。"],
    ["杀类规则", "杀一肖、杀一尾、杀一合、杀一头、杀一段、杀一行都是排除规则：下期没开到才算正确。"],
    ["候选类规则", "七尾、八肖、九肖是候选支持规则：下期落在集合里才算正确。七尾不是杀尾。"],
    ["时间关系", "默认用第 N 期计算，用第 N+1 期的特码验证；八肖管两期验证 N+1 和 N+2；期合按后三位期数计算，例如 174 期合=1+7+4=12。"],
    ["归一化", "杀肖结果大于 49 减 48；杀合减 13；杀头减 5；杀段减 7；出现 0 等异常要提示。"],
    ["待人工确认", "遇到单独的“位/平位/定位”、样例对不上、表值不一致、类型不明确时，不要猜，标记待人工确认。"],
    ["公式校验", "每条公式应校验变量取值、计算过程、原始结果、归一化、映射结果和下一期对错判断。"],
    ["逐期明细", "每条公式都要展示每期完整计算流水账：当前期、变量、过程、结果处理、下一期开奖和对错。"],
    ["综合参考", "综合参考合并已启用且可计算的用户提供公式；样例未核对不拦截，计算报错、变量不确定、停用或手动退出的公式不参与。"],
    ["自动筛选", "系统推荐公式和文档公式分开；推荐公式必须先看训练期、验证期、错期和逐期明细，确认后才能加入。"],
  ];
  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <Badge tone="cyan">RuleQuant 规则理解锁定版</Badge>
        <h2 className="mt-3 text-[22px] font-semibold leading-tight text-white">所有计算、校验、逐期明细和综合参考都按这里执行</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">如果程序计算结果和 TXT 手算样例不一致，必须标红并允许人工修改公式、顺序、变量或配置后重新校验；遇到文档没有覆盖的规则，不自行猜测，标记待人工确认。</p>
      </Panel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map(([title, body]) => (
          <Panel key={title} className="p-5">
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function HelpContent() {
  const items = [
    ["L序是什么", "落球顺序：n1,n2,n3,n4,n5,n6,special，对应 L1-L7。"],
    ["D序是什么", "只把 6 个平码按大小排序得到 D1-D6，D7/特码仍然是原始特码。"],
    ["平位和特码", "平1-平7 会按规则的 L/D 模式取值；特码永远等于 special。"],
    ["平3位和平三码区别", "平三码、平四码、平3、平4 是开奖号码本身；平3位、平4位 是该号码生肖在固定十二生肖序中的位置，鼠1到猪12。"],
    ["头尾合合尾", "头为十位，尾为个位，合为号码各位相加，合尾为合数个位。"],
    ["段位", "01-07 为 1段，08-14 为 2段，依此到 43-49 为 7段。"],
    ["波色值", "红=0，蓝=1，绿=2，配置中心可编辑。"],
    ["五行值", "金=1，木=2，水=3，火=4，土=5，配置中心可编辑。"],
    ["杀肖/杀合/杀尾/杀段", "用第 N 期公式输出要排除的属性，再用第 N+1 期特码属性验证是否避开。"],
    ["七尾", "公式得到 baseTail 后，按 [-3,-2,-1,0,+1,+2,+4] 生成 7 个尾数集合。"],
    ["八肖/九肖", "八肖是生肖集合命中验证；杀三肖可反向得到九肖候选。"],
    ["导入数据", "进入数据导入页，粘贴 CSV/TXT 或选择 Excel，先预览再写入本地库。"],
    ["新增规则", "规则管理页填写类型、序列、公式、归一化、目标后保存。"],
    ["运行回测", "回测中心会实时基于启用规则运行，并展示每期过程。"],
    ["样例校验", "录入 TXT 手算样例的 raw、归一、映射和验证结果，不一致会标红。"],
    ["备份配置", "配置中心或导出报告页可导出规则库、配置和回测结果。"],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map(([title, body]) => (
        <Panel key={title} className="p-5">
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
        </Panel>
      ))}
    </div>
  );
}
