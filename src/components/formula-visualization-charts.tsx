"use client";

import { useId } from "react";
import type {
  FormulaParetoRow,
  FormulaVisualizationModel,
  FormulaVisualizationSeries,
} from "@/lib/formula-summary/formula-visualization";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

function linePath(points: Point[]): string {
  return points.map((point, index) => (
    `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  )).join(" ");
}

function xAt(index: number, count: number, left: number, width: number): number {
  return count <= 1 ? left + width / 2 : left + index / (count - 1) * width;
}

export function FormulaComparisonTrend({
  model,
  selected,
  focusedIssue,
  onFocusPeriod,
}: {
  model: FormulaVisualizationModel;
  selected: FormulaVisualizationSeries;
  focusedIssue: string;
  onFocusPeriod: (issue: string) => void;
}) {
  const gradientId = `rq-comparison-${useId().replace(/:/g, "")}`;
  const width = 760;
  const height = 226;
  const left = 42;
  const right = 34;
  const top = 26;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(1, ...selected.values, ...model.leaderValues);
  const point = (value: number, index: number): Point => ({
    x: xAt(index, model.calculationIssues.length, left, plotWidth),
    y: top + plotHeight - value / maxValue * plotHeight,
  });
  const selectedPoints = selected.values.map(point);
  const leaderPoints = model.leaderValues.map(point);
  const medianPoints = model.medianValues.map(point);
  const selectedPath = linePath(selectedPoints);
  const areaPath = selectedPoints.length
    ? `${selectedPath} L${selectedPoints.at(-1)?.x.toFixed(1)} ${top + plotHeight} L${selectedPoints[0].x.toFixed(1)} ${top + plotHeight} Z`
    : "";
  const latestSelected = selected.values.at(-1) ?? 0;
  const latestLeader = model.leaderValues.at(-1) ?? 0;
  const latestMedian = model.medianValues.at(-1) ?? 0;

  return (
    <div className="rq-formula-viz__comparison-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${selected.label}与每期领先值、中位数对比；${model.calculationIssues.length}期依次为${selected.values.join("、")}，最新${latestSelected}次，中位数${latestMedian}次`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="rq-formula-viz__comparison-fill-start" />
            <stop offset="100%" className="rq-formula-viz__comparison-fill-end" />
          </linearGradient>
        </defs>
        {[0, .5, 1].map((ratio) => {
          const value = Math.round(maxValue * (1 - ratio));
          const y = top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="rq-formula-viz__grid-line" />
              <text x={left - 10} y={y + 4} textAnchor="end" className="rq-formula-viz__axis-label">{value}</text>
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} className="rq-formula-viz__comparison-area" />}
        <path d={linePath(leaderPoints)} className="rq-formula-viz__comparison-line is-leader" />
        <path d={linePath(medianPoints)} className="rq-formula-viz__comparison-line is-median" />
        <path d={selectedPath} className="rq-formula-viz__comparison-line is-selected" />
        {selectedPoints.map((selectedPoint, index) => (
          <g key={model.calculationIssues[index]} className={cn(focusedIssue === model.calculationIssues[index] && "is-focused")}>
            <circle cx={selectedPoint.x} cy={selectedPoint.y} r="5" className="rq-formula-viz__comparison-dot" />
            <text x={selectedPoint.x} y={height - 11} textAnchor="middle" className="rq-formula-viz__axis-label">
              {model.calculationIssues[index]}
            </text>
          </g>
        ))}
        {selectedPoints.length > 0 && (
          <g className="rq-formula-viz__endpoint-labels">
            <text x={width - right} y={(selectedPoints.at(-1)?.y ?? 0) - 10} textAnchor="end" className="is-selected">{selected.label} {latestSelected}</text>
            <text x={width - right} y={Math.max(top + 11, (leaderPoints.at(-1)?.y ?? 0) - 9)} textAnchor="end" className="is-leader">领先 {latestLeader}</text>
            <text x={width - right} y={Math.min(top + plotHeight - 5, (medianPoints.at(-1)?.y ?? 0) + 16)} textAnchor="end" className="is-median">中位数 {latestMedian}</text>
          </g>
        )}
      </svg>
      <div className="rq-formula-viz__chart-legend" aria-label="趋势图图例">
        <span className="is-selected"><i />{selected.label}</span>
        <span className="is-leader"><i />每期领先</span>
        <span className="is-median"><i />结果中位数</span>
      </div>
      <div className="rq-formula-viz__period-filter" aria-label={`${selected.label}期次筛选`}>
        {model.calculationIssues.map((issue, index) => (
          <button
            key={issue}
            type="button"
            data-period-issue={issue}
            aria-pressed={focusedIssue === issue}
            className={cn(focusedIssue === issue && "is-active")}
            onClick={() => onFocusPeriod(issue)}
          >
            <span>{issue}</span>
            <strong>{selected.values[index]}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FormulaRankTrajectory({
  model,
  series,
  selectedTargetKey,
  onSelectTarget,
}: {
  model: FormulaVisualizationModel;
  series: FormulaVisualizationSeries[];
  selectedTargetKey: string;
  onSelectTarget: (targetKey: string) => void;
}) {
  const width = 720;
  const height = 250;
  const left = 58;
  const right = 58;
  const top = 28;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxRank = Math.max(1, ...series.flatMap((item) => item.ranks));
  const selected = series.find((item) => item.targetKey === selectedTargetKey) ?? series[0];
  const yAt = (rank: number) => top + (rank - 1) / Math.max(1, maxRank - 1) * plotHeight;

  return (
    <div className="rq-formula-viz__trajectory-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${selected?.label ?? "所选结果"}排名从第${selected?.ranks[0] ?? 0}位到第${selected?.ranks.at(-1) ?? 0}位；第1位位于图表顶部`}
      >
        {Array.from({ length: maxRank }, (_, index) => index + 1).map((rank) => {
          const y = yAt(rank);
          return (
            <g key={rank}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="rq-formula-viz__grid-line" />
              <text x={left - 12} y={y + 4} textAnchor="end" className="rq-formula-viz__axis-label">#{rank}</text>
            </g>
          );
        })}
        {series.map((item, seriesIndex) => {
          const points = item.ranks.map((rank, index) => ({
            x: xAt(index, model.calculationIssues.length, left, plotWidth),
            y: yAt(rank),
          }));
          const isSelected = item.targetKey === selectedTargetKey;
          return (
            <g key={item.targetKey} className={cn(`series-${seriesIndex + 1}`, isSelected && "is-selected")}>
              <path d={linePath(points)} className="rq-formula-viz__trajectory-line" />
              {points.map((point, index) => (
                <circle key={model.calculationIssues[index]} cx={point.x} cy={point.y} r={isSelected ? 5 : 3.5} className="rq-formula-viz__trajectory-dot" />
              ))}
              <text x={left - 8} y={(points[0]?.y ?? 0) - 7} textAnchor="end" className="rq-formula-viz__trajectory-label">{item.label}</text>
              <text x={width - right + 8} y={(points.at(-1)?.y ?? 0) - 7} className="rq-formula-viz__trajectory-label">{item.label}</text>
            </g>
          );
        })}
        {model.calculationIssues.map((issue, index) => (
          <text key={issue} x={xAt(index, model.calculationIssues.length, left, plotWidth)} y={height - 9} textAnchor="middle" className="rq-formula-viz__axis-label">{issue}</text>
        ))}
      </svg>
      <div className="rq-formula-viz__trajectory-controls" aria-label="排名轨迹结果选择">
        {series.map((item, index) => (
          <button
            key={item.targetKey}
            type="button"
            data-chart-target={item.targetKey}
            aria-pressed={item.targetKey === selectedTargetKey}
            className={cn(`series-${index + 1}`, item.targetKey === selectedTargetKey && "is-active")}
            onClick={() => onSelectTarget(item.targetKey)}
          >
            <i />{item.label}<span>#{item.ranks.at(-1)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FormulaParetoChart({ rows }: { rows: FormulaParetoRow[] }) {
  const width = 620;
  const height = 292;
  const left = 132;
  const right = 50;
  const top = 20;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const rowHeight = rows.length ? plotHeight / rows.length : plotHeight;
  const cumulativePoints = rows.map((row, index) => ({
    x: left + row.cumulativeShare / 100 * plotWidth,
    y: top + rowHeight * index + rowHeight / 2,
  }));
  const referenceX = left + plotWidth * .8;

  if (rows.length === 0) return <p className="rq-formula-viz__empty">当前筛选暂无公式贡献</p>;

  return (
    <div className="rq-formula-viz__pareto-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`公式贡献帕累托图，${rows.map((row) => `${row.label}${row.count}次累计${row.cumulativeShare}%`).join("；")}`}
      >
        <line x1={referenceX} y1={top - 5} x2={referenceX} y2={top + plotHeight} className="rq-formula-viz__pareto-reference" />
        <text x={referenceX + 5} y={top + 4} className="rq-formula-viz__pareto-reference-label">80%</text>
        {rows.map((row, index) => {
          const y = top + rowHeight * index;
          const barWidth = row.count / maxCount * plotWidth;
          return (
            <g key={row.id} className={cn(row.isRemainder && "is-remainder")}>
              <text x={left - 12} y={y + rowHeight / 2 + 4} textAnchor="end" className="rq-formula-viz__pareto-label">{row.label}</text>
              <rect x={left} y={y + rowHeight * .18} width={barWidth} height={rowHeight * .64} rx="5" className="rq-formula-viz__pareto-bar" />
              <text x={left + Math.max(22, barWidth) - 7} y={y + rowHeight / 2 + 4} textAnchor="end" className="rq-formula-viz__pareto-count">{row.count}</text>
              <text x={width - right + 8} y={y + rowHeight / 2 + 4} className="rq-formula-viz__pareto-share">{row.cumulativeShare}%</text>
            </g>
          );
        })}
        <path d={linePath(cumulativePoints)} className="rq-formula-viz__pareto-line" />
        {cumulativePoints.map((point, index) => (
          <circle key={rows[index].id} cx={point.x} cy={point.y} r="4" className="rq-formula-viz__pareto-dot" />
        ))}
        <text x={left} y={height - 6} className="rq-formula-viz__axis-label">0%</text>
        <text x={left + plotWidth} y={height - 6} textAnchor="end" className="rq-formula-viz__axis-label">100% 累计占比</text>
      </svg>
      <div className="rq-formula-viz__chart-legend">
        <span className="is-bars"><i />公式贡献次数</span>
        <span className="is-cumulative"><i />累计占比</span>
        <span className="is-reference"><i />80% 参考线</span>
      </div>
    </div>
  );
}
