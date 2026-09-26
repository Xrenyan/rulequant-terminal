"use client";

import { lazy, startTransition, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useOverlayMotion } from "@/components/ui/use-overlay-motion";
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
  const routeSearch = searchParams.toString();
  // Router object identity may change without navigation. Only a changed URL
  // should synchronize filters, not an unrelated render after a local tab click.
  const routeFilters = useMemo(() => parseAnalysisSearchParams(new URLSearchParams(routeSearch)), [routeSearch]);
  const [filters, setFilters] = useState<FormulaAnalysisFilters>(routeFilters);
  const committedFilters = useRef(filters);
  useLayoutEffect(() => { committedFilters.current = filters; }, [filters]);
  const displayedTab = useDeferredValue(filters.tab);
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
  const mobileSheetRef = useRef<HTMLElement>(null);
  const mobileBackdropRef = useRef<HTMLButtonElement>(null);
  const { requestClose: closeMobileFilters } = useOverlayMotion({ open: mobileFiltersOpen, surfaceRef: mobileSheetRef, backdropRef: mobileBackdropRef, onClose: () => setMobileFiltersOpen(false) });
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
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); closeMobileFilters(); return; }
      if (event.key !== "Tab" || !mobileSheetRef.current) return;
      const controls = [...mobileSheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex="0"]')]
        .filter((element) => !element.closest('.rq-analysis-toolbar__primary, .rq-analysis-toolbar__mobile-trigger, [hidden]'));
      // Include only this sheet's portalled Select options. Intercept their tab
      // order so focus cannot walk through background controls between portals.
      const menus = [...document.querySelectorAll<HTMLElement>('[role="listbox"]')].filter((menu) => {
        const owner = document.getElementById(menu.getAttribute("aria-labelledby") ?? "");
        return owner && mobileSheetRef.current?.contains(owner);
      });
      for (const menu of menus) controls.push(...menu.querySelectorAll<HTMLElement>('[role="option"]:not([disabled])'));
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (menus.length) {
        event.preventDefault();
        const current = controls.indexOf(document.activeElement as HTMLElement);
        controls[(current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
        return;
      }
      if (!mobileSheetRef.current.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    mobileCloseRef.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      returnFocus?.focus({ preventScroll: true });
    };
  }, [mobileFiltersOpen, closeMobileFilters]);

  useEffect(() => () => {
    if (urlUpdateTimer.current) window.clearTimeout(urlUpdateTimer.current);
  }, []);

  const changeFilters = useCallback((next: FormulaAnalysisFilters) => {
    setFilters(next);
    setToolbarStatus("");
    if (typeof window !== "undefined") {
      if (urlUpdateTimer.current) window.clearTimeout(urlUpdateTimer.current);
      urlUpdateTimer.current = window.setTimeout(() => {
        // Keep the host's deployment prefix (for example GitHub Pages) intact.
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${serializeAnalysisSearchParams(next)}`);
      }, 320);
    }
  }, []);
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
  const openTab = useCallback((tab: FormulaAnalysisTab) => changeFilters({ ...committedFilters.current, tab }), [changeFilters]);
  const openLanding = useCallback(() => openTab("landing"), [openTab]);
  const openDiagnostics = useCallback(() => openTab("diagnostics"), [openTab]);
  const openEvidence = useCallback((record: FormulaDrawLandingRecord) => {
    setFocusedRecord(record);
    setFocusedEvidenceIssue(record.calculationIssue);
    openTab("evidence");
  }, [openTab]);
  const openIssueEvidence = useCallback((issue: string) => {
    setFocusedEvidenceIssue(issue);
    setFocusedRecord(report?.landing.records.find((record) => record.calculationIssue === issue));
    openTab("evidence");
  }, [openTab, report]);

  // Keep the old expensive tree identical during urgent controls/tab updates.
  // Evidence-only props must not invalidate the outgoing overview/landing tree.
  const evidenceRecord = displayedTab === "evidence" ? focusedRecord : undefined;
  const evidenceIssue = displayedTab === "evidence" ? focusedEvidenceIssue : "";
  const workspace = useMemo(() => report && <Suspense fallback={<FormulaAnalysisLoading message="正在打开当前分析区域…" />}>
    {displayedTab === "overview"
      ? <FormulaAnalysisOverview report={report} onOpenEvidence={openEvidence} onOpenLanding={openLanding} onOpenDiagnostics={openDiagnostics} />
      : displayedTab === "landing"
        ? <LazyFormulaLandingWorkspace report={report} onSelectRecord={openEvidence} />
        : displayedTab === "diagnostics"
          ? <LazyFormulaHealthWorkspace report={report} onOpenIssue={openIssueEvidence} />
          : <LazyFormulaEvidenceWorkspace key={`${report.cacheKey}:${evidenceRecord?.calculationIssue ?? evidenceIssue}`} report={report} initialRecord={evidenceRecord} initialIssue={evidenceIssue} />}
  </Suspense>, [report, displayedTab, openEvidence, openLanding, openDiagnostics, openIssueEvidence, evidenceRecord, evidenceIssue]);
  const comparisonVisualization = useMemo(() => report && comparisonReport
    ? <ExpandableVisualization title="周期对比图"><FormulaAnalysisComparison current={report} comparison={comparisonReport} /></ExpandableVisualization>
    : null, [report, comparisonReport]);

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

      <nav className="rq-analysis-tabs" role="tablist" aria-label="公式分析区域" onKeyDown={(event) => {
        const index = TABS.findIndex((tab) => tab.key === filters.tab);
        const nextIndex = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
        if (nextIndex < 0) return;
        event.preventDefault();
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus({ preventScroll: true });
        changeFilters({ ...filters, tab: TABS[nextIndex].key });
      }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return <Button key={tab.key} id={`rq-analysis-tab-${tab.key}`} role="tab" tabIndex={filters.tab === tab.key ? 0 : -1} aria-controls="rq-analysis-workspace" aria-selected={filters.tab === tab.key} variant={filters.tab === tab.key ? "primary" : "ghost"} onClick={() => changeFilters({ ...filters, tab: tab.key })}><Icon className="h-4 w-4" /><span><b>{tab.label}</b><small>{tab.description}</small></span></Button>;
        })}
      </nav>

      {refreshing && <div className="rq-analysis-refresh" role="status"><LoaderCircle className="h-4 w-4" /><span>正在更新当前筛选，下面先保留上一次结果，不会整页空白。</span></div>}
      {filters.compare.kind === "window" && report && comparisonReport
        ? comparisonVisualization
        : filters.compare.kind === "window" && <div className="rq-analysis-refresh" role="status"><LoaderCircle className="h-4 w-4" /><span>正在准备对比周期…</span></div>}

      {error ? <Panel className="rq-analysis-error" role="alert"><CircleAlert className="h-5 w-5" /><div><strong>分析暂时无法完成</strong><p>{error}</p></div></Panel>
        : report ? <div id="rq-analysis-workspace" className="rq-analysis-workspace" role="tabpanel" aria-labelledby={`rq-analysis-tab-${displayedTab}`} aria-busy={displayedTab !== filters.tab || refreshing}>{workspace}</div>
          : <FormulaAnalysisLoading />}
      {focusedRecord && <span className="sr-only" data-focused-landing-record={focusedRecord.calculationIssue}>已定位 {focusedRecord.targetIssue} 期 {focusedRecord.actualLabel}</span>}

      {mobileFiltersOpen && typeof document !== "undefined" && createPortal(
        <div className="rq-analysis-filter-layer">
          <button ref={mobileBackdropRef} type="button" className="rq-analysis-filter-backdrop" tabIndex={-1} aria-label="关闭分析筛选" onClick={closeMobileFilters} />
          <section ref={mobileSheetRef} className="rq-analysis-filter-sheet" role="dialog" aria-modal="true" aria-label="分析筛选">
            <header><div><strong>分析筛选</strong><small>结果类型、公式组、对比与保存视图</small></div><button ref={mobileCloseRef} type="button" className="rq-button rq-button--ghost inline-flex h-11 w-11 items-center justify-center border" aria-label="关闭分析筛选" onClick={closeMobileFilters}><X className="h-5 w-5" /></button></header>
            <FormulaAnalysisToolbar filters={filters} rules={rules} savedViews={savedViews} selectedViewId={selectedViewId} statusMessage={toolbarStatus} onChange={changeFilters} onSave={saveCurrentView} onRestore={restoreView} onDelete={deleteView} onOpenMobileFilters={() => undefined} />
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
