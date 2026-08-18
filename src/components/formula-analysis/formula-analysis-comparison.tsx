"use client";

import { GitCompareArrows, TrendingDown, TrendingUp } from "lucide-react";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";

function display(value: number, suffix = ""): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

function delta(value: number): string {
  if (Math.abs(value) < .05) return "持平";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function FormulaAnalysisComparison({ current, comparison }: { current: FormulaAnalysisReport; comparison: FormulaAnalysisReport }) {
  const currentTopRate = current.landing.records.length ? current.landing.kpis.topThreePeriods / current.landing.records.length * 100 : 0;
  const comparisonTopRate = comparison.landing.records.length ? comparison.landing.kpis.topThreePeriods / comparison.landing.records.length * 100 : 0;
  const metrics = [
    { key: "average-count", label: "平均次数变化", current: current.landing.kpis.averageCount, baseline: comparison.landing.kpis.averageCount, suffix: "次", lowerIsBetter: false },
    { key: "top-three", label: "前三位占比变化", current: currentTopRate, baseline: comparisonTopRate, suffix: "%", lowerIsBetter: false },
    { key: "average-rank", label: "平均位置变化", current: current.landing.kpis.averageRank, baseline: comparison.landing.kpis.averageRank, suffix: "位", lowerIsBetter: true },
    { key: "maximum", label: "单期最高次数变化", current: current.landing.kpis.maxCount, baseline: comparison.landing.kpis.maxCount, suffix: "次", lowerIsBetter: false },
  ];
  const countDifference = current.landing.kpis.averageCount - comparison.landing.kpis.averageCount;
  const rankDifference = current.landing.kpis.averageRank - comparison.landing.kpis.averageRank;
  const takeaway = Math.abs(countDifference) < .05 && Math.abs(rankDifference) < .05
    ? "短期和较长周期表现接近，暂未出现明显偏离。"
    : countDifference > 0 && rankDifference < 0
      ? "短期实际落点得到的公式意见更集中，位置也比长期更靠前。"
      : countDifference < 0 && rankDifference > 0
        ? "短期实际落点得到的公式意见减少，位置也比长期更靠后。"
        : "次数与位置的变化方向不同，建议进入落点趋势逐期核验。";

  return <Panel className="rq-analysis-comparison" data-analysis-comparison>
    <header><div><span><GitCompareArrows className="h-4 w-4" />对比结论</span><h2>{takeaway}</h2><p>蓝色代表当前最近{current.window}期，灰色代表最近{comparison.window}期；只比较已开奖样本。</p></div><div><Badge tone="cyan">最近{current.window}期</Badge><span>对比</span><Badge tone="slate">最近{comparison.window}期</Badge></div></header>
    <div className="rq-analysis-comparison__metrics">
      {metrics.map((metric) => {
        const maximum = Math.max(1, metric.current, metric.baseline);
        const difference = metric.current - metric.baseline;
        const favorable = metric.lowerIsBetter ? difference < 0 : difference > 0;
        const Direction = difference < 0 ? TrendingDown : TrendingUp;
        return <article key={metric.key} data-comparison-metric={metric.key}>
          <header><span>{metric.label}</span><em className={Math.abs(difference) < .05 ? "is-flat" : favorable ? "is-positive" : "is-negative"}>{Math.abs(difference) >= .05 && <Direction className="h-3.5 w-3.5" />}{delta(difference)}</em></header>
          <div data-comparison-series="current"><small>最近{current.window}期</small><span><i style={{ width: `${metric.current / maximum * 100}%` }} /></span><b>{display(metric.current, metric.suffix)}</b></div>
          <div className="is-baseline" data-comparison-series="baseline"><small>最近{comparison.window}期</small><span><i style={{ width: `${metric.baseline / maximum * 100}%` }} /></span><b>{display(metric.baseline, metric.suffix)}</b></div>
        </article>;
      })}
    </div>
  </Panel>;
}
