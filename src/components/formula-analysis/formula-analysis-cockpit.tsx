"use client";

import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Activity, ArrowLeft, BarChart3, CircleAlert, ListChecks, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
import type { FormulaAnalysisFilters, FormulaAnalysisReport, FormulaAnalysisTab, SavedFormulaAnalysisView } from "@/lib/formula-analysis/types";
import { formulaAnalysisInputKey, type FormulaAnalysisReportInput } from "@/lib/formula-analysis/build-analysis-report";
import { startFormulaAnalysisReportRequest } from "@/lib/formula-analysis/formula-analysis-worker-client";
import {
  deleteAnalysisView,
  parseAnalysisSearchParams,
  readSavedViews,
  restoreAnalysisView,
  saveAnalysisView,
  serializeAnalysisSearchParams,
  writeSavedViews,
} from "@/lib/formula-analysis/saved-views";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { FormulaAnalysisLoading } from "@/components/formula-analysis/formula-analysis-loading";
import { FormulaAnalysisToolbar } from "@/components/formula-analysis/formula-analysis-toolbar";
import { FormulaAnalysisOverview } from "@/components/formula-analysis/formula-analysis-overview";
import { FormulaAnalysisComparison } from "@/components/formula-analysis/formula-analysis-comparison";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";

const loadFormulaLandingWorkspace = () => import("@/components/formula-analysis/formula-landing-workspace");
const loadFormulaHealthWorkspace = () => import("@/components/formula-analysis/formula-health-workspace");
const loadFormulaEvidenceWorkspace = () => import("@/components/formula-analysis/formula-evidence-workspace");

const LazyFormulaLandingWorkspace = lazy(() => loadFormulaLandingWorkspace().then((module) => ({ default: module.FormulaLandingWorkspace })));
const LazyFormulaHealthWorkspace = lazy(() => loadFormulaHealthWorkspace().then((module) => ({ default: module.FormulaHealthWorkspace })));
const LazyFormulaEvidenceWorkspace = lazy(() => loadFormulaEvidenceWorkspace().then((module) => ({ default: module.FormulaEvidenceWorkspace })));

function preloadAnalysisWorkspaces() {
  return Promise.all([
    loadFormulaLandingWorkspace(),
    loadFormulaHealthWorkspace(),
    loadFormulaEvidenceWorkspace(),
  ]);
}

const TABS: Array<{ key: FormulaAnalysisTab; label: string; description: string; icon: typeof Activity }> = [
  { key: "overview", label: "概览", description: "先看重点结论", icon: Activity },
  { key: "landing", label: "落点趋势", description: "实际开在第几位", icon: BarChart3 },
  { key: "diagnostics", label: "公式诊断", description: "健康、重复与冲突", icon: ShieldCheck },
  { key: "evidence", label: "明细核验", description: "逐期追到原公式", icon: ListChecks },
];

function formatUpdatedAt(value?: string): string {
  if (!value) return "等待同步";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export type FormulaAnalysisCockpitProps = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  dataSourceLabel: string;
  lastSyncAt?: string;
  cloudStateMeta?: { updatedAt?: string; enabled?: boolean; recordCount?: number };
};

export function FormulaAnalysisCockpit({ draws, rules, config, dataSourceLabel, lastSyncAt, cloudStateMeta }: FormulaAnalysisCockpitProps) {
  const searchParams = useSearchParams();
  const routeFilters = useMemo(() => parseAnalysisSearchParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [filters, setFilters] = useState<FormulaAnalysisFilters>(routeFilters);
  const analysisInput = useMemo<FormulaAnalysisReportInput>(() => ({
    draws,
    rules,
    config,
    window: filters.window,
    action: filters.action,
    targetType: filters.targetType,
    ruleIds: filters.ruleIds,
    source: {
      label: dataSourceLabel,
      updatedAt: cloudStateMeta?.updatedAt ?? lastSyncAt,
      offline: false,
      partial: Boolean(cloudStateMeta?.enabled && !cloudStateMeta.recordCount),
    },
  }), [cloudStateMeta, config, dataSourceLabel, draws, filters.action, filters.ruleIds, filters.targetType, filters.window, lastSyncAt, rules]);
  const analysisRequestKey = useMemo(() => formulaAnalysisInputKey(analysisInput), [analysisInput]);
  const comparisonInput = useMemo<FormulaAnalysisReportInput | undefined>(() => filters.compare.kind === "window"
    ? { ...analysisInput, window: filters.compare.value }
    : undefined, [analysisInput, filters.compare]);
  const comparisonRequestKey = useMemo(() => comparisonInput ? formulaAnalysisInputKey(comparisonInput) : "", [comparisonInput]);
  const [analysisState, setAnalysisState] = useState<{ key: string; report?: FormulaAnalysisReport; error?: string }>({ key: "" });
  const [comparisonState, setComparisonState] = useState<{ key: string; report?: FormulaAnalysisReport }>({ key: "" });
  const [savedViews, setSavedViews] = useState<SavedFormulaAnalysisView[]>(readSavedViews);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [toolbarStatus, setToolbarStatus] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [focusedRecord, setFocusedRecord] = useState<FormulaDrawLandingRecord>();
  const [focusedEvidenceIssue, setFocusedEvidenceIssue] = useState("");
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const urlUpdateTimer = useRef<number | undefined>(undefined);
  const report = analysisState.report;
  const refreshing = Boolean(report && analysisState.key !== analysisRequestKey);
  const error = analysisState.key === analysisRequestKey ? analysisState.error ?? "" : "";
  const comparisonReport = comparisonState.key === comparisonRequestKey ? comparisonState.report : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => serializeAnalysisSearchParams(current) === serializeAnalysisSearchParams(routeFilters) ? current : routeFilters);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [routeFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void preloadAnalysisWorkspaces().catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return startFormulaAnalysisReportRequest(analysisInput, {
      onResult: (nextReport) => startTransition(() => setAnalysisState({ key: analysisRequestKey, report: nextReport })),
      onError: (message) => startTransition(() => setAnalysisState((current) => ({ key: analysisRequestKey, report: current.report, error: message }))),
    });
  }, [analysisInput, analysisRequestKey]);

  useEffect(() => {
    if (!comparisonInput) return;
    return startFormulaAnalysisReportRequest(comparisonInput, {
      onResult: (nextReport) => startTransition(() => setComparisonState({ key: comparisonRequestKey, report: nextReport })),
    });
  }, [comparisonInput, comparisonRequestKey]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    };
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => mobileCloseRef.current?.focus());
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileFiltersOpen]);

  useEffect(() => () => {
    if (urlUpdateTimer.current) window.clearTimeout(urlUpdateTimer.current);
  }, []);

  const changeFilters = (next: FormulaAnalysisFilters) => {
    setFilters(next);
    setToolbarStatus("");
    if (typeof window !== "undefined") {
      if (urlUpdateTimer.current) window.clearTimeout(urlUpdateTimer.current);
      urlUpdateTimer.current = window.setTimeout(() => {
        window.history.replaceState(window.history.state, "", `/formula-result-statistics/analysis?${serializeAnalysisSearchParams(next)}`);
      }, 320);
    }
  };
  const saveCurrentView = () => {
    const now = new Date().toISOString();
    const id = `view-${Date.now().toString(36)}`;
    const next = saveAnalysisView(savedViews, {
      id,
      name: `常用视图 ${savedViews.length + 1}`,
      filters,
      makeDefault: savedViews.length === 0,
      now,
    });
    writeSavedViews(next);
    setSavedViews(next);
    setSelectedViewId(id);
    setToolbarStatus(`已保存“常用视图 ${savedViews.length + 1}”`);
  };
  const restoreView = (id: string) => {
    if (id === "none") {
      setSelectedViewId("");
      return;
    }
    const view = savedViews.find((item) => item.id === id);
    if (!view) return;
    const restored = restoreAnalysisView(view, new Set(rules.map((rule) => rule.id)));
    setSelectedViewId(id);
    changeFilters(restored.filters);
    setToolbarStatus(`已恢复“${view.name}”`);
  };
  const deleteView = (id: string) => {
    const next = deleteAnalysisView(savedViews, id);
    writeSavedViews(next);
    setSavedViews(next);
    setSelectedViewId("");
    setToolbarStatus("已删除当前保存视图");
  };
  const openEvidence = (record: FormulaDrawLandingRecord) => {
    setFocusedRecord(record);
    setFocusedEvidenceIssue(record.calculationIssue);
    changeFilters({ ...filters, tab: "evidence" });
  };
  const openIssueEvidence = (issue: string) => {
    setFocusedEvidenceIssue(issue);
    setFocusedRecord(report?.landing.records.find((record) => record.calculationIssue === issue));
    changeFilters({ ...filters, tab: "evidence" });
  };

  const workspace = report && <Suspense fallback={<FormulaAnalysisLoading message="正在打开当前分析区域…" />}>
    {filters.tab === "overview"
      ? <FormulaAnalysisOverview report={report} onOpenEvidence={openEvidence} onOpenLanding={() => changeFilters({ ...filters, tab: "landing" })} onOpenDiagnostics={() => changeFilters({ ...filters, tab: "diagnostics" })} />
      : filters.tab === "landing"
        ? <LazyFormulaLandingWorkspace report={report} onSelectRecord={openEvidence} />
        : filters.tab === "diagnostics"
          ? <LazyFormulaHealthWorkspace report={report} onOpenIssue={openIssueEvidence} />
          : <LazyFormulaEvidenceWorkspace key={`${report.cacheKey}:${focusedRecord?.calculationIssue ?? focusedEvidenceIssue}`} report={report} initialRecord={focusedRecord} initialIssue={focusedEvidenceIssue} />}
  </Suspense>;

  return (
    <div className={`rq-analysis-cockpit ${filters.action === "exclude" ? "is-exclude" : "is-include"}`}>
      <header className="rq-analysis-cockpit__header">
        <Link href="/formula-result-statistics" className="rq-analysis-back"><ArrowLeft className="h-4 w-4" />返回公式结果统计</Link>
        <div className="rq-analysis-cockpit__title"><strong>最近{filters.window}期 · {filters.action === "exclude" ? "排除结果" : "支持结果"}</strong><span>{dataSourceLabel} · 更新 {formatUpdatedAt(cloudStateMeta?.updatedAt ?? lastSyncAt)}</span></div>
      </header>

      <FormulaAnalysisToolbar
        filters={filters}
        rules={rules}
        savedViews={savedViews}
        selectedViewId={selectedViewId}
        statusMessage={toolbarStatus}
        onChange={changeFilters}
        onSave={saveCurrentView}
        onRestore={restoreView}
        onDelete={deleteView}
        onOpenMobileFilters={() => setMobileFiltersOpen(true)}
      />

      <nav className="rq-analysis-tabs" aria-label="公式分析区域">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return <Button key={tab.key} role="tab" aria-selected={filters.tab === tab.key} variant={filters.tab === tab.key ? "primary" : "ghost"} onClick={() => changeFilters({ ...filters, tab: tab.key })}><Icon className="h-4 w-4" /><span><b>{tab.label}</b><small>{tab.description}</small></span></Button>;
        })}
      </nav>

      {refreshing && <div className="rq-analysis-refresh" role="status"><LoaderCircle className="h-4 w-4" /><span>正在更新当前筛选，下面先保留上一次结果，不会整页空白。</span></div>}
      {filters.compare.kind === "window" && report && comparisonReport
        ? <ExpandableVisualization title="周期对比图"><FormulaAnalysisComparison current={report} comparison={comparisonReport} /></ExpandableVisualization>
        : filters.compare.kind === "window" && <div className="rq-analysis-refresh" role="status"><LoaderCircle className="h-4 w-4" /><span>正在准备对比周期…</span></div>}

      {error ? <Panel className="rq-analysis-error" role="alert"><CircleAlert className="h-5 w-5" /><div><strong>分析暂时无法完成</strong><p>{error}</p></div></Panel>
        : report ? workspace
          : <FormulaAnalysisLoading />}
      {focusedRecord && <span className="sr-only" data-focused-landing-record={focusedRecord.calculationIssue}>已定位 {focusedRecord.targetIssue} 期 {focusedRecord.actualLabel}</span>}

      {mobileFiltersOpen && typeof document !== "undefined" && createPortal(
        <div className="rq-analysis-filter-layer">
          <button type="button" className="rq-analysis-filter-backdrop" aria-label="关闭分析筛选" onClick={() => setMobileFiltersOpen(false)} />
          <section className="rq-analysis-filter-sheet" role="dialog" aria-modal="true" aria-label="分析筛选">
            <header><div><strong>分析筛选</strong><small>结果类型、公式组、对比与保存视图</small></div><button ref={mobileCloseRef} type="button" className="rq-button rq-button--ghost inline-flex h-11 w-11 items-center justify-center border" aria-label="关闭分析筛选" onClick={() => setMobileFiltersOpen(false)}><X className="h-5 w-5" /></button></header>
            <FormulaAnalysisToolbar filters={filters} rules={rules} savedViews={savedViews} selectedViewId={selectedViewId} statusMessage={toolbarStatus} onChange={changeFilters} onSave={saveCurrentView} onRestore={restoreView} onDelete={deleteView} onOpenMobileFilters={() => undefined} />
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
