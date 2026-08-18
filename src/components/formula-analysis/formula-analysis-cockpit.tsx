"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BarChart3, CircleAlert, ListChecks, ShieldCheck, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
import type { FormulaAnalysisFilters, FormulaAnalysisReport, FormulaAnalysisTab, SavedFormulaAnalysisView } from "@/lib/formula-analysis/types";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { FormulaAnalysisLoading } from "@/components/formula-analysis/formula-analysis-loading";
import { FormulaAnalysisToolbar } from "@/components/formula-analysis/formula-analysis-toolbar";

const TABS: Array<{ key: FormulaAnalysisTab; label: string; description: string; icon: typeof Activity }> = [
  { key: "overview", label: "概览", description: "先看重点结论", icon: Activity },
  { key: "landing", label: "落点趋势", description: "实际开在第几位", icon: BarChart3 },
  { key: "diagnostics", label: "公式诊断", description: "健康、重复与冲突", icon: ShieldCheck },
  { key: "evidence", label: "明细核验", description: "逐期追到原公式", icon: ListChecks },
];

export type FormulaAnalysisCockpitProps = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
  dataSourceLabel: string;
  lastSyncAt?: string;
  cloudStateMeta?: { updatedAt?: string; enabled?: boolean; recordCount?: number };
};

function AnalysisPlaceholder({ tab, report }: { tab: FormulaAnalysisTab; report: FormulaAnalysisReport }) {
  const copy = {
    overview: ["分析概览", "把健康度、实际落点和数据状态放在一屏内，先看异常再看证据。"],
    landing: ["实际落点趋势", report.landing.insight],
    diagnostics: ["公式健康与冲突", `已检查 ${report.health.rows.length} 条公式，发现 ${report.pairs.duplicates.length} 组高度重复、${report.pairs.conflicts.length} 组方向冲突。`],
    evidence: ["逐期明细核验", "从期次、开奖结果和贡献公式三层核对，零次也会如实显示。"],
  }[tab];
  return <Panel className="rq-analysis-placeholder"><CircleAlert className="h-5 w-5" /><div><h2>{copy[0]}</h2><p>{copy[1]}</p></div></Panel>;
}

export function FormulaAnalysisCockpit({ draws, rules, config, dataSourceLabel, lastSyncAt, cloudStateMeta }: FormulaAnalysisCockpitProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseAnalysisSearchParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [report, setReport] = useState<FormulaAnalysisReport>();
  const [error, setError] = useState("");
  const [savedViews, setSavedViews] = useState<SavedFormulaAnalysisView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setSavedViews(readSavedViews()), []);

  useEffect(() => {
    setError("");
    setReport(undefined);
    return startFormulaAnalysisReportRequest({
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
    }, {
      onResult: (nextReport) => startTransition(() => setReport(nextReport)),
      onError: setError,
    });
  }, [cloudStateMeta?.enabled, cloudStateMeta?.recordCount, cloudStateMeta?.updatedAt, config, dataSourceLabel, draws, filters.action, filters.ruleIds, filters.targetType, filters.window, lastSyncAt, rules]);

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

  const changeFilters = (next: FormulaAnalysisFilters) => {
    startTransition(() => router.replace(`/formula-result-statistics/analysis?${serializeAnalysisSearchParams(next)}`, { scroll: false }));
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
  };
  const deleteView = (id: string) => {
    const next = deleteAnalysisView(savedViews, id);
    writeSavedViews(next);
    setSavedViews(next);
    setSelectedViewId("");
  };

  return (
    <div className="rq-analysis-cockpit">
      <Panel className="rq-analysis-cockpit__hero">
        <div><Badge tone="cyan">六合彩公式分析</Badge><h2>公式分析驾驶舱</h2><p>先看实际开奖落在“被排除/被支持几次”的位置，再追到具体公式和计算期。这里只描述历史表现，不承诺未来结果。</p></div>
        <div className="rq-analysis-cockpit__source"><small>当前数据</small><strong>{dataSourceLabel}</strong><span>最近更新：{cloudStateMeta?.updatedAt ?? lastSyncAt ?? "等待首次同步"}</span></div>
      </Panel>

      <FormulaAnalysisToolbar
        filters={filters}
        rules={rules}
        savedViews={savedViews}
        selectedViewId={selectedViewId}
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

      {error ? <Panel className="rq-analysis-error" role="alert"><CircleAlert className="h-5 w-5" /><div><strong>分析暂时无法完成</strong><p>{error}</p></div></Panel>
        : report ? <AnalysisPlaceholder tab={filters.tab} report={report} />
          : <FormulaAnalysisLoading />}

      {mobileFiltersOpen && typeof document !== "undefined" && createPortal(
        <div className="rq-analysis-filter-layer">
          <button type="button" className="rq-analysis-filter-backdrop" aria-label="关闭分析筛选" onClick={() => setMobileFiltersOpen(false)} />
          <section className="rq-analysis-filter-sheet" role="dialog" aria-modal="true" aria-label="分析筛选">
            <header><div><strong>分析筛选</strong><small>结果类型、公式组、对比与保存视图</small></div><button ref={mobileCloseRef} type="button" className="rq-button rq-button--ghost inline-flex h-11 w-11 items-center justify-center border" aria-label="关闭分析筛选" onClick={() => setMobileFiltersOpen(false)}><X className="h-5 w-5" /></button></header>
            <FormulaAnalysisToolbar filters={filters} rules={rules} savedViews={savedViews} selectedViewId={selectedViewId} onChange={changeFilters} onSave={saveCurrentView} onRestore={restoreView} onDelete={deleteView} onOpenMobileFilters={() => undefined} />
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
