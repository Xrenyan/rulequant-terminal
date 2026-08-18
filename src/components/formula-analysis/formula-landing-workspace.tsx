"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, ChartNoAxesColumnIncreasing, Info, ListFilter } from "lucide-react";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";
import { FormulaDrawLandingChart } from "@/components/formula-draw-landing-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";

type LandingMode = "timeline" | "count-distribution" | "rank-distribution";

type DistributionBin = {
  value: number;
  periods: number;
  tied: boolean;
  records: FormulaDrawLandingRecord[];
};

function Distribution({
  records,
  mode,
  actionWord,
  onSelect,
}: {
  records: FormulaDrawLandingRecord[];
  mode: Exclude<LandingMode, "timeline">;
  actionWord: string;
  onSelect: (record: FormulaDrawLandingRecord) => void;
}) {
  const [selectedValue, setSelectedValue] = useState<number>();
  const bins = useMemo<DistributionBin[]>(() => {
    if (mode === "count-distribution") {
      const maximum = Math.max(0, ...records.map((record) => record.count));
      return Array.from({ length: maximum + 1 }, (_, value) => {
        const matches = records.filter((record) => record.count === value);
        return { value, periods: matches.length, tied: false, records: matches };
      });
    }
    return [...new Set(records.map((record) => record.rank))].sort((a, b) => a - b).map((value) => {
      const matches = records.filter((record) => record.rank === value);
      return {
        value,
        periods: matches.length,
        tied: matches.some((record) => record.tieCount > 1),
        records: matches,
      };
    });
  }, [mode, records]);
  const maximum = Math.max(1, ...bins.map((bin) => bin.periods));
  const selectedBin = bins.find((bin) => bin.value === selectedValue);

  return (
    <Panel className="rq-landing-distribution">
      <header><div><span>{mode === "count-distribution" ? `${actionWord}次数分布` : "实际落点位置分布"}</span><h2>{mode === "count-distribution" ? "最近各期分别落在几次" : "最近各期分别落在第几位"}</h2><p>点击任意横条，可查看组成这个区间的全部期次。</p></div><Badge tone="slate">共 {records.length} 个已开奖期</Badge></header>
      <div className="rq-landing-distribution__bins">
        {bins.map((bin) => (
          <button
            key={bin.value}
            type="button"
            data-count-bin={mode === "count-distribution" ? bin.value : undefined}
            data-rank-bin={mode === "rank-distribution" ? bin.value : undefined}
            data-periods={bin.periods}
            aria-pressed={selectedValue === bin.value}
            className={cn(selectedValue === bin.value && "is-selected")}
            onClick={() => setSelectedValue((current) => current === bin.value ? undefined : bin.value)}
          >
            <span><b>{mode === "count-distribution" ? `${bin.value} 次` : `第 ${bin.value} 位`}</b>{bin.tied && <small>含并列</small>}</span>
            <i><em style={{ width: `${bin.periods / maximum * 100}%` }} /></i>
            <strong>{bin.periods}<small>期</small></strong>
          </button>
        ))}
      </div>
      {selectedBin && (
        <section className="rq-landing-distribution__selection" aria-label="符合这个区间的期次">
          <header><strong>符合这个区间的期次</strong><span>{selectedBin.periods} 期</span></header>
          <div>{selectedBin.records.map((record) => <button key={record.calculationIssue} type="button" onClick={() => onSelect(record)}><small>{record.targetIssue}期</small><b>{String(record.specialNumber).padStart(2, "0")} · {record.actualLabel}</b><span>{actionWord}{record.count}次 · {record.rankLabel}</span></button>)}</div>
        </section>
      )}
      <p><Info className="h-4 w-4" />只统计已开奖期，待开奖期不进入分布；0 次会保留，不会被隐藏。</p>
    </Panel>
  );
}

export function FormulaLandingWorkspace({ report, onSelectRecord }: { report: FormulaAnalysisReport; onSelectRecord: (record: FormulaDrawLandingRecord) => void }) {
  const [mode, setMode] = useState<LandingMode>("timeline");
  const [selectedIssue, setSelectedIssue] = useState("");
  const records = report.landing.records;
  const selectedRecord = records.find((record) => record.calculationIssue === selectedIssue);
  const actionWord = report.action === "exclude" ? "被排除" : "被支持";
  const select = (record: FormulaDrawLandingRecord) => setSelectedIssue(record.calculationIssue);

  return (
    <div className="rq-landing-workspace">
      <Panel className="rq-landing-workspace__head">
        <div><Badge tone="cyan">实际开奖 × 公式结果</Badge><h2>实际落点趋势</h2><p>把两个最重要的问题放在同一张图里：柱形看次数，折线看位置。点击图中任一期后，再决定是否进入公式明细。</p></div>
        <div className="rq-segmented-control" aria-label="落点图表模式">
          <Button size="sm" variant={mode === "timeline" ? "primary" : "ghost"} aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}><BarChart3 className="h-4 w-4" />逐期趋势</Button>
          <Button size="sm" variant={mode === "count-distribution" ? "primary" : "ghost"} aria-pressed={mode === "count-distribution"} onClick={() => setMode("count-distribution")}><ChartNoAxesColumnIncreasing className="h-4 w-4" />次数分布</Button>
          <Button size="sm" variant={mode === "rank-distribution" ? "primary" : "ghost"} aria-pressed={mode === "rank-distribution"} onClick={() => setMode("rank-distribution")}><ListFilter className="h-4 w-4" />位置分布</Button>
        </div>
      </Panel>

      {mode === "timeline" ? (
        <Panel className="rq-landing-combined-chart">
          <FormulaDrawLandingChart records={records} focusedIssue={selectedIssue} unitLabel={`${actionWord}次数`} onFocusRecord={select} />
        </Panel>
      ) : (
        <ExpandableVisualization title={mode === "count-distribution" ? "实际落点次数分布" : "实际落点位置分布"}><Distribution key={mode} records={records} mode={mode} actionWord={actionWord} onSelect={select} /></ExpandableVisualization>
      )}

      {selectedRecord && (
        <Panel className="rq-landing-workspace__selection" role="status">
          <div><small>当前选择</small><strong>{selectedRecord.targetIssue} 期 · {String(selectedRecord.specialNumber).padStart(2, "0")} · {selectedRecord.actualLabel}</strong><span>{actionWord}{selectedRecord.count}次，{selectedRecord.rankLabel}；点击右侧可核验具体由哪些公式产生。</span></div>
          <Button size="sm" onClick={() => onSelectRecord(selectedRecord)}>查看这一期公式明细<ArrowRight className="h-4 w-4" /></Button>
        </Panel>
      )}
    </div>
  );
}
