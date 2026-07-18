"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, RefreshCw } from "lucide-react";
import {
  analyzeHistoricalNineGrid,
  DRAW_POSITION_LABELS,
  type BinaryTrendReport,
  type HistoricalNineGridBacktest,
  type HistoricalNineGridMode,
  type HistoricalNineGridOccurrence,
} from "@/lib/special-analysis/special-analysis";
import { getNumberAttributes } from "@/lib/engine/attributes";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type Props = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
  dataSourceLabel: string;
  sourceLoading: boolean;
  onSync: () => void;
};

function numberLabel(number: number, config: RuleQuantConfig) {
  return `${String(number).padStart(2, "0")} ${getNumberAttributes(number, config).zodiac}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.035] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 break-words text-[24px] font-semibold leading-none text-white tabular-nums">{value}</p>
    </div>
  );
}

function HistoricalGridCard({ occurrence }: { occurrence: HistoricalNineGridOccurrence }) {
  const rowOffsets = [-1, 0, 1] as const;
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm text-white">{occurrence.issue}期 · {DRAW_POSITION_LABELS[occurrence.positionIndex]}</strong>
        <Badge tone="cyan">定位</Badge>
      </div>
      <div className="mt-3 grid grid-cols-[54px_repeat(3,minmax(0,1fr))] gap-1.5">
        <span />
        {occurrence.columnIndexes.map((index) => (
          <span key={index} className="pb-1 text-center text-xs text-slate-500">{DRAW_POSITION_LABELS[index]}</span>
        ))}
        {rowOffsets.map((rowOffset) => {
          const cells = occurrence.cells.filter((cell) => cell.rowOffset === rowOffset);
          return (
            <div className="contents" key={rowOffset}>
              <span className={cn("flex items-center justify-center text-xs tabular-nums", rowOffset === 0 ? "font-semibold text-cyan-200" : "text-slate-500")}>{cells[0]?.issue.slice(-3)}</span>
              {cells.map((cell) => (
                <div key={`${cell.issue}-${cell.positionIndex}`} className={cn("relative flex min-h-16 flex-col items-center justify-center rounded-lg border text-center", cell.isAnchor ? "border-cyan-300/55 bg-cyan-300/15" : rowOffset === 0 ? "border-white/[0.12] bg-white/[0.05]" : "border-white/[0.07] bg-black/10")}>
                  <strong className="text-base text-white tabular-nums">{String(cell.number).padStart(2, "0")}</strong>
                  <span className="mt-1 text-xs text-slate-400">{cell.zodiac}</span>
                  {cell.isAnchor ? <Crosshair className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-cyan-200" /> : null}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BacktestCard({ title, report, mode, config, compact = false }: { title: string; report: HistoricalNineGridBacktest; mode: HistoricalNineGridMode; config: RuleQuantConfig; compact?: boolean }) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">每一期只使用当时已经公布的数据，核对下一期特号排名。</p>
        </div>
        <Badge tone={report.total ? "green" : "slate"}>{report.total} 期</Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {report.topRates.map((item) => (
          <div key={item.top} className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-3 text-center">
            <span className="text-xs text-slate-500">Top {item.top}</span>
            <strong className="mt-1 block text-lg text-white tabular-nums">{item.rate}%</strong>
            <small className="text-xs text-slate-500">{item.success}/{report.total}</small>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">平均命中位置：{report.total ? `第 ${report.averageRank} 位` : "样本不足"}</p>
      {!compact && report.rows.length > 0 ? (
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-white/[0.07]">
          {report.rows.slice(0, 12).map((row) => (
            <div key={`${row.anchorIssue}-${row.nextIssue}`} className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/[0.06] px-3 py-2.5 text-xs last:border-0">
              <div>
                <span className="text-slate-500">{row.anchorIssue.slice(-3)} → {row.nextIssue.slice(-3)}</span>
                <p className="mt-1 text-slate-300">开 {numberLabel(row.actualNumber, config)}</p>
              </div>
              <div className="text-right">
                <strong className={cn("text-sm", row.rank <= (mode === "number" ? 18 : 9) ? "text-emerald-300" : "text-rose-300")}>第 {row.rank} 位</strong>
                <p className="mt-1 text-slate-500">{row.sampleCount} 个历史格</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function NineGridWorkspace({ draws, config }: { draws: DrawRecord[]; config: RuleQuantConfig }) {
  const [mode, setMode] = useState<HistoricalNineGridMode>("zodiac");
  const [section, setSection] = useState<"ranking" | "backtest" | "evidence">("ranking");
  const [showAllRankings, setShowAllRankings] = useState(false);
  const [visibleGridCount, setVisibleGridCount] = useState(4);
  const requestKey = useMemo(() => {
    const latest = draws.at(-1);
    return JSON.stringify([mode, draws.length, latest?.issue, latest?.n1, latest?.n2, latest?.n3, latest?.n4, latest?.n5, latest?.n6, latest?.special, config]);
  }, [draws, config, mode]);
  const [analysis, setAnalysis] = useState<{ key: string; report?: ReturnType<typeof analyzeHistoricalNineGrid>; loading: boolean; error: string }>({ key: "", loading: true, error: "" });

  useEffect(() => {
    let disposed = false;
    const worker = new Worker(new URL("../workers/special-analysis.worker.ts", import.meta.url));
    setAnalysis({ key: requestKey, loading: true, error: "" });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; report?: ReturnType<typeof analyzeHistoricalNineGrid>; error?: string }>) => {
      if (disposed) return;
      setAnalysis({ key: requestKey, report: event.data.report, loading: false, error: event.data.ok ? "" : event.data.error ?? "九宫格分析失败" });
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (disposed) return;
      setAnalysis({ key: requestKey, loading: false, error: event.message || "九宫格分析暂时无法启动" });
      worker.terminate();
    };
    worker.postMessage({ kind: "nine-grid", draws, config, mode });
    return () => {
      disposed = true;
      worker.terminate();
    };
  }, [draws, config, mode, requestKey]);

  const report = analysis.key === requestKey ? analysis.report : undefined;

  if (analysis.loading || analysis.key !== requestKey) {
    return <Panel className="p-5"><div className="rq-inline-progress"><span className="rq-progress-spinner" aria-hidden="true" /><div><strong>正在整理九宫格历史数据</strong><p>页面仍可切换和滚动，结果完成后会自动显示。</p></div></div></Panel>;
  }

  if (analysis.error) {
    return <Panel className="p-5"><Badge tone="rose">分析未完成</Badge><h3 className="mt-3 font-semibold text-white">{analysis.error}</h3></Panel>;
  }

  if (!report) {
    return <Panel className="p-5"><Badge tone="cyan">历史锚点九宫格</Badge><h3 className="mt-3 font-semibold text-white">开奖记录不足，暂时无法生成九宫格排行。</h3></Panel>;
  }

  const rankingLimit = mode === "number" && !showAllRankings ? 18 : report.rankings.length;
  const rankingItems = report.rankings.slice(0, rankingLimit);
  const maxCount = report.rankings[0]?.count || 1;
  const visibleOccurrences = report.occurrences.slice(0, visibleGridCount);

  return (
    <div className="space-y-4">
      <Panel className="rq-nine-grid-workbench p-4 sm:p-5">
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="rq-eyebrow">最新特号历史锚点</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <h3 className="text-[22px] font-semibold text-white">{report.anchorIssue}期 · {numberLabel(report.anchorNumber, config)}</h3>
              <Badge tone="cyan">用于 {report.targetIssue} 期观察</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">生肖模式查历史所有“{report.anchorZodiac}”，号码模式查历史所有“{String(report.anchorNumber).padStart(2, "0")}”。每次截取前后3期和相邻3列，再统计完整排行。</p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-1">
            <button type="button" className={cn("min-h-11 rounded-lg px-4 text-sm font-semibold transition", mode === "zodiac" ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-white/[0.05]")} onClick={() => { setMode("zodiac"); setShowAllRankings(false); }}>生肖 {report.anchorZodiac}</button>
            <button type="button" className={cn("min-h-11 rounded-lg px-4 text-sm font-semibold transition", mode === "number" ? "bg-blue-400/15 text-blue-100" : "text-slate-400 hover:bg-white/[0.05]")} onClick={() => { setMode("number"); setShowAllRankings(false); }}>号码 {String(report.anchorNumber).padStart(2, "0")}</button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="历史出现位置" value={`${report.occurrences.length} 次`} />
          <Metric label="累计九宫格" value={`${report.occurrences.length * 9} 格`} />
          <Metric label="同锚点验证" value={`${report.conditionedBacktest.total} 期`} />
          <Metric label="全量滚动验证" value={`${report.overallBacktest.total} 期`} />
        </div>
      </Panel>

      <nav className="rq-workspace-tabs rq-nine-section-tabs" aria-label="九宫格分析内容">
        <button type="button" className={cn("rq-workspace-tab", section === "ranking" && "rq-workspace-tab--active")} onClick={() => setSection("ranking")}><span>频次排行</span><small>生肖与49码</small></button>
        <button type="button" className={cn("rq-workspace-tab", section === "backtest" && "rq-workspace-tab--active")} onClick={() => setSection("backtest")}><span>回测验证</span><small>同锚点与滚动验证</small></button>
        <button type="button" className={cn("rq-workspace-tab", section === "evidence" && "rq-workspace-tab--active")} onClick={() => setSection("evidence")}><span>历史九宫格</span><small>逐次查看证据</small></button>
      </nav>

      {section === "ranking" ? <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-semibold text-white">{mode === "zodiac" ? "生肖频次排行" : "49码频次排行"}</h3><p className="mt-1 text-xs text-slate-500">排名来自全部历史九宫格，定位格也会计入并单独标明。</p></div>
          <Badge tone="slate">显示 {rankingItems.length}/{report.rankings.length}</Badge>
        </div>
        <div className={cn("mt-4 grid gap-2", mode === "zodiac" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4") }>
          {rankingItems.map((item) => (
            <div key={item.key} className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/[0.03]"><i className="block h-full bg-cyan-300/55" style={{ width: `${Math.max(3, item.count / maxCount * 100)}%` }} /></div>
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-cyan-200">#{item.rank}</span><span className="text-xs text-slate-500">{item.share}%</span></div>
              <div className="mt-2 flex items-baseline gap-2"><strong className="text-xl text-white tabular-nums">{item.label}</strong>{mode === "number" ? <span className="text-sm text-slate-400">{item.zodiac}</span> : null}</div>
              <p className="mt-2 text-xs text-slate-500">出现 {item.count} 格 · 定位 {item.anchorCount} 次</p>
            </div>
          ))}
        </div>
        {mode === "number" ? <div className="mt-4 flex justify-center"><Button onClick={() => setShowAllRankings((value) => !value)}>{showAllRankings ? "收起到 Top18" : "查看完整49码排行"}</Button></div> : null}
      </Panel> : null}

      {section === "backtest" ? <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BacktestCard title={`同${mode === "number" ? `号码${String(report.anchorNumber).padStart(2, "0")}` : `生肖${report.anchorZodiac}`}历史验证`} report={report.conditionedBacktest} mode={mode} config={config} />
        <BacktestCard title="全量逐期滚动验证" report={report.overallBacktest} mode={mode} config={config} compact />
      </div> : null}

      {section === "evidence" ? <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-white">历史九宫格证据</h3><p className="mt-1 text-xs text-slate-500">平1取自己和右边两列，特码取左边两列和自己，中间位置取左、中、右三列。</p></div><Badge tone="slate">显示 {Math.min(visibleGridCount, report.occurrences.length)}/{report.occurrences.length}</Badge></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{visibleOccurrences.map((occurrence) => <HistoricalGridCard key={occurrence.id} occurrence={occurrence} />)}</div>
        {report.occurrences.length > visibleGridCount ? <div className="mt-4 flex justify-center"><Button onClick={() => setVisibleGridCount((count) => count + 4)}>再看4个九宫格</Button></div> : null}
      </Panel> : null}

    </div>
  );
}

function TrendCard({ report }: { report: BinaryTrendReport }) {
  const top = [...report.probabilities].sort((a, b) => b.probability - a.probability)[0];
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{report.title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{report.explanation}</p></div><Badge tone={report.backtestRate >= 55 ? "green" : "yellow"}>滚动验证 {report.backtestRate}%</Badge></div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {report.probabilities.map((item) => <div key={item.label} className={cn("rounded-lg border p-4", item.label === top.label ? "border-cyan-300/35 bg-cyan-300/10" : "border-white/[0.08] bg-white/[0.03]")}><p className="text-sm text-slate-400">下一期参考：{item.label}</p><p className="mt-2 text-[28px] font-semibold text-white tabular-nums">{item.probability}%</p></div>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{report.sequence20.map((item, index) => <span key={`${item}-${index}`} className={cn("flex h-8 w-8 items-center justify-center rounded-md border text-xs", item === report.labels[0] ? "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100" : "border-violet-300/20 bg-violet-300/[0.08] text-violet-100")}>{item}</span>)}</div>
      <div className="mt-3 flex flex-wrap gap-2">{report.modelWeights.slice(0, 3).map((model) => <Badge key={model.label} tone="slate">{model.label} {model.weight}%</Badge>)}</div>
      <p className="mt-3 text-xs leading-5 text-slate-500">最近20期 · 当前连续 {report.currentLabel} {report.currentStreak} 期 · 学习样本 {report.trainingSamples} 期 · 概率差 {report.confidence}% · 历史滚动验证 {report.backtestSuccess}/{report.backtestTotal}</p>
    </Panel>
  );
}

function BinaryTrendWorkspace({ draws }: { draws: DrawRecord[] }) {
  const latest = draws.at(-1);
  const requestKey = `${draws.length}:${latest?.issue ?? ""}:${latest?.special ?? ""}`;
  const [analysis, setAnalysis] = useState<{ key: string; size?: BinaryTrendReport; parity?: BinaryTrendReport; loading: boolean; error: string }>({ key: "", loading: true, error: "" });

  useEffect(() => {
    let disposed = false;
    const worker = new Worker(new URL("../workers/special-analysis.worker.ts", import.meta.url));
    setAnalysis({ key: requestKey, loading: true, error: "" });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; size?: BinaryTrendReport; parity?: BinaryTrendReport; error?: string }>) => {
      if (disposed) return;
      setAnalysis({ key: requestKey, size: event.data.size, parity: event.data.parity, loading: false, error: event.data.ok ? "" : event.data.error ?? "走势分析失败" });
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (disposed) return;
      setAnalysis({ key: requestKey, loading: false, error: event.message || "走势分析暂时无法启动" });
      worker.terminate();
    };
    worker.postMessage({ kind: "binary", draws });
    return () => {
      disposed = true;
      worker.terminate();
    };
  }, [draws, requestKey]);

  if (analysis.loading || analysis.key !== requestKey) {
    return <Panel className="p-5"><div className="rq-inline-progress"><span className="rq-progress-spinner" aria-hidden="true" /><div><strong>正在分析大小单双走势</strong><p>正在整理近期开奖和滚动验证结果。</p></div></div></Panel>;
  }
  if (analysis.error || !analysis.size || !analysis.parity) {
    return <Panel className="p-5"><Badge tone="rose">分析未完成</Badge><h3 className="mt-3 font-semibold text-white">{analysis.error || "样本不足"}</h3></Panel>;
  }
  return <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><TrendCard report={analysis.size} /><TrendCard report={analysis.parity} /></div>;
}

export function SpecialAnalysisView({ draws, config, dataSourceLabel, sourceLoading, onSync }: Props) {
  const [tab, setTab] = useState<"nine-grid" | "trends">("nine-grid");

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">专项观察</Badge><Badge tone="green">{draws.length}期真实数据</Badge></div><h2 className="mt-3 text-xl font-semibold text-white">九宫格与二分类走势</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">这里只观察历史九宫格、大小和单双。杀半头、杀一门、杀一波等公式统一在公式库中新增、回测和管理。</p></div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone="slate">数据来源：{dataSourceLabel}</Badge><Button variant="primary" disabled={sourceLoading} onClick={onSync}><RefreshCw className={cn("h-4 w-4", sourceLoading && "animate-spin")} />{sourceLoading ? "同步中" : "同步最新开奖"}</Button></div>
        </div>
      </Panel>

      <nav className="rq-workspace-tabs rq-special-tabs" aria-label="专项分析工作区">
        <button type="button" className={cn("rq-workspace-tab", tab === "nine-grid" && "rq-workspace-tab--active")} onClick={() => setTab("nine-grid")}><span>九宫格</span><small>历史锚点排行</small></button>
        <button type="button" className={cn("rq-workspace-tab", tab === "trends" && "rq-workspace-tab--active")} onClick={() => setTab("trends")}><span>大小单双</span><small>近20-30期走势</small></button>
      </nav>

      {tab === "nine-grid" ? <NineGridWorkspace draws={draws} config={config} /> : <BinaryTrendWorkspace draws={draws} />}
    </div>
  );
}
