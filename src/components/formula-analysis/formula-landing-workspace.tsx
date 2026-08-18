"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChartNoAxesColumnIncreasing, Info, ListFilter, Target } from "lucide-react";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

type LandingMode = "timeline" | "count-distribution" | "rank-distribution";

function points(records: FormulaDrawLandingRecord[], value: (record: FormulaDrawLandingRecord) => number, invert = false) {
  const width = 760;
  const height = 170;
  const left = 36;
  const right = 24;
  const top = 24;
  const bottom = 38;
  const values = records.map(value);
  const maximum = Math.max(1, ...values);
  return records.map((record, index) => {
    const x = records.length <= 1 ? width / 2 : left + index / (records.length - 1) * (width - left - right);
    const normalized = invert ? (value(record) - 1) / Math.max(1, maximum - 1) : value(record) / maximum;
    const y = invert ? top + normalized * (height - top - bottom) : height - bottom - normalized * (height - top - bottom);
    return { record, x, y };
  });
}

function path(items: Array<{ x: number; y: number }>): string {
  return items.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function LandingTimeline({ records, actionWord, actionVerb, onSelect }: { records: FormulaDrawLandingRecord[]; actionWord: string; actionVerb: string; onSelect: (record: FormulaDrawLandingRecord) => void }) {
  const countPoints = points(records, (record) => record.count);
  const rankPoints = points(records, (record) => record.rank, true);
  return (
    <div className="rq-landing-timeline">
      <section className="rq-landing-chart-card">
        <header><div><span><ChartNoAxesColumnIncreasing className="h-4 w-4" />{actionWord}次数 · 越高代表同时{actionVerb}它的公式越多</span></div><Badge tone="rose">单位：次</Badge></header>
        <div className="rq-landing-chart-scroll">
          <svg viewBox="0 0 760 170" role="img" aria-label={`${actionWord}次数折线图，共${records.length}个已开奖期`}>
            <line x1="36" y1="132" x2="736" y2="132" className="rq-landing-axis" />
            <path d={path(countPoints)} className="rq-landing-count-line" />
            {countPoints.map(({ record, x, y }) => <g key={record.calculationIssue} data-count-point={record.calculationIssue}><circle cx={x} cy={y} r="5" /><text x={x} y={Math.max(16, y - 10)} textAnchor="middle">{record.count}</text><text x={x} y="156" textAnchor="middle">{record.targetIssue}</text></g>)}
          </svg>
        </div>
      </section>
      <section className="rq-landing-chart-card">
        <header><div><span><Target className="h-4 w-4" />当期位置 · 第1位在最上方</span><p>并列不会被强行拆开</p></div><Badge tone="cyan">单位：位</Badge></header>
        <div className="rq-landing-chart-scroll">
          <svg viewBox="0 0 760 170" role="img" aria-label={`当期位置折线图，第1位在最上方，共${records.length}个已开奖期`}>
            <line x1="36" y1="24" x2="736" y2="24" className="rq-landing-rank-one" /><text x="38" y="18">第1位</text>
            <path d={path(rankPoints)} className="rq-landing-rank-line" />
            {rankPoints.map(({ record, x, y }) => <g key={record.calculationIssue} data-rank-point={record.calculationIssue}><circle cx={x} cy={y} r="5" /><text x={x} y={Math.max(16, y - 10)} textAnchor="middle">#{record.rank}</text><text x={x} y="156" textAnchor="middle">{record.targetIssue}</text></g>)}
          </svg>
        </div>
      </section>
      <div className="rq-landing-period-controls" aria-label="选择期次查看实际落点">
        {records.map((record) => <button key={record.calculationIssue} type="button" data-landing-period-control={record.calculationIssue} className="min-h-11" onClick={() => onSelect(record)}><small>{record.targetIssue}期</small><b>{record.actualLabel} · {String(record.specialNumber).padStart(2, "0")}</b><span>{actionWord}{record.count}次 · {record.rankLabel}</span></button>)}
      </div>
    </div>
  );
}

function Distribution({ records, mode, actionWord }: { records: FormulaDrawLandingRecord[]; mode: Exclude<LandingMode, "timeline">; actionWord: string }) {
  const bins = useMemo(() => {
    if (mode === "count-distribution") {
      const maximum = Math.max(0, ...records.map((record) => record.count));
      return Array.from({ length: maximum + 1 }, (_, value) => ({
        value,
        periods: records.filter((record) => record.count === value).length,
        tied: false,
      }));
    }
    return [...new Set(records.map((record) => record.rank))].sort((a, b) => a - b).map((value) => ({
      value,
      periods: records.filter((record) => record.rank === value).length,
      tied: records.some((record) => record.rank === value && record.tieCount > 1),
    }));
  }, [mode, records]);
  const maximum = Math.max(1, ...bins.map((bin) => bin.periods));
  return (
    <Panel className="rq-landing-distribution">
      <header><div><span>{mode === "count-distribution" ? `${actionWord}次数分布` : "实际落点位置分布"}</span><h2>{mode === "count-distribution" ? "最近各期分别落在几次" : "最近各期分别落在第几位"}</h2></div><Badge tone="slate">共 {records.length} 个已开奖期</Badge></header>
      <div className="rq-landing-distribution__bins">
        {bins.map((bin) => <article key={bin.value} data-count-bin={mode === "count-distribution" ? bin.value : undefined} data-rank-bin={mode === "rank-distribution" ? bin.value : undefined} data-periods={bin.periods}><span><b>{mode === "count-distribution" ? `${bin.value} 次` : `第 ${bin.value} 位`}</b>{bin.tied && <small>含并列</small>}</span><i><em style={{ width: `${bin.periods / maximum * 100}%` }} /></i><strong>{bin.periods}<small>期</small></strong></article>)}
      </div>
      <p><Info className="h-4 w-4" />只统计已开奖期，待开奖期不进入分布；0 次会保留，不会被隐藏。</p>
    </Panel>
  );
}

export function FormulaLandingWorkspace({ report, onSelectRecord }: { report: FormulaAnalysisReport; onSelectRecord: (record: FormulaDrawLandingRecord) => void }) {
  const [mode, setMode] = useState<LandingMode>("timeline");
  const [selectedIssue, setSelectedIssue] = useState("");
  const records = report.landing.records;
  const actionWord = report.action === "exclude" ? "被排除" : "被支持";
  const actionVerb = report.action === "exclude" ? "排除" : "支持";
  const select = (record: FormulaDrawLandingRecord) => {
    setSelectedIssue(record.calculationIssue);
    onSelectRecord(record);
  };
  return (
    <div className="rq-landing-workspace">
      <Panel className="rq-landing-workspace__head">
        <div><Badge tone="cyan">实际开奖 × 公式结果</Badge><h2>落点趋势</h2><p>每一期先找出实际开出的结果，再看它在全部公式结果中{actionWord}了几次、排在第几位。两个单位分开画，避免把“次数”和“名次”混在一条轴上。</p></div>
        <div className="rq-segmented-control" aria-label="落点图表模式">
          <Button size="sm" variant={mode === "timeline" ? "primary" : "ghost"} aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}><BarChart3 className="h-4 w-4" />逐期趋势</Button>
          <Button size="sm" variant={mode === "count-distribution" ? "primary" : "ghost"} aria-pressed={mode === "count-distribution"} onClick={() => setMode("count-distribution")}><ChartNoAxesColumnIncreasing className="h-4 w-4" />次数分布</Button>
          <Button size="sm" variant={mode === "rank-distribution" ? "primary" : "ghost"} aria-pressed={mode === "rank-distribution"} onClick={() => setMode("rank-distribution")}><ListFilter className="h-4 w-4" />位置分布</Button>
        </div>
      </Panel>
      {mode === "timeline" ? <LandingTimeline records={records} actionWord={actionWord} actionVerb={actionVerb} onSelect={select} /> : <Distribution records={records} mode={mode} actionWord={actionWord} />}
      {selectedIssue && <p className="rq-landing-workspace__selection" role="status">已选择 {records.find((record) => record.calculationIssue === selectedIssue)?.targetIssue} 期；明细核验会同时定位到该期和实际结果。</p>}
    </div>
  );
}
