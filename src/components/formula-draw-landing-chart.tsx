"use client";

import type { KeyboardEvent } from "react";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";
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

export function FormulaDrawLandingChart({
  records,
  focusedIssue,
  unitLabel,
  onFocusIssue,
}: {
  records: FormulaDrawLandingRecord[];
  focusedIssue: string;
  unitLabel: string;
  onFocusIssue: (issue: string) => void;
}) {
  if (records.length === 0) {
    return <p className="rq-formula-landing-chart__empty">当前暂无已开奖期可验证实际结果</p>;
  }

  const width = 760;
  const height = 300;
  const left = 62;
  const right = 78;
  const top = 42;
  const bottom = 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxCount = Math.max(1, ...records.map((record) => record.count));
  const maxRank = Math.max(1, ...records.map((record) => record.rank));
  const average = records.reduce((sum, record) => sum + record.count, 0) / records.length;
  const yCount = (count: number) => top + plotHeight - count / maxCount * plotHeight;
  const yRank = (rank: number) => top + (rank - 1) / Math.max(1, maxRank - 1) * plotHeight;
  const barWidth = Math.min(48, plotWidth / Math.max(1, records.length) * .42);
  const baseline = top + plotHeight;
  const rankPoints = records.map((record, index) => ({
    x: xAt(index, records.length, left, plotWidth),
    y: yRank(record.rank),
  }));
  const countTicks = [maxCount, Math.round(maxCount / 2), 0].filter((value, index, values) => (
    values.indexOf(value) === index
  ));
  const rankTicks = Array.from({ length: maxRank }, (_, index) => index + 1);
  const summary = records.map((record) => (
    `${record.targetIssue}期，实际${record.actualLabel}，特码${String(record.specialNumber).padStart(2, "0")}，${unitLabel}${record.count}，${record.rankLabel}`
  )).join("；");

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, issue: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onFocusIssue(issue);
    }
  };

  return (
    <div className="rq-formula-landing-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`实际开奖落点组合图；柱形为${unitLabel}，折线为当期位置，第1位在上；${summary}`}
      >
        <text x={left} y={20} className="rq-formula-landing-chart__axis-title">次数</text>
        <text x={width - right} y={20} textAnchor="end" className="rq-formula-landing-chart__axis-title">
          当期位置 · 第1位在上
        </text>

        {countTicks.map((count) => {
          const y = yCount(count);
          return (
            <g key={count}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="rq-formula-landing-chart__grid-line" />
              <text x={left - 10} y={y + 4} textAnchor="end" className="rq-formula-landing-chart__axis-label">{count}</text>
            </g>
          );
        })}

        {rankTicks.map((rank) => (
          <text
            key={rank}
            x={width - right + 10}
            y={yRank(rank) + 4}
            className="rq-formula-landing-chart__axis-label is-rank"
          >
            #{rank}
          </text>
        ))}

        {records.length >= 2 && (
          <g className="rq-formula-landing-chart__average">
            <line
              x1={left}
              y1={yCount(average)}
              x2={width - right}
              y2={yCount(average)}
              strokeDasharray="6 5"
              className="rq-formula-landing-chart__average-line"
            />
            <text x={left + 6} y={yCount(average) - 6} className="rq-formula-landing-chart__average-label">
              平均 {average.toFixed(1)}
            </text>
          </g>
        )}

        <path d={linePath(rankPoints)} className="rq-formula-landing-chart__rank-line" />

        {records.map((record, index) => {
          const x = xAt(index, records.length, left, plotWidth);
          const countY = yCount(record.count);
          const rankY = yRank(record.rank);
          const isFocused = record.calculationIssue === focusedIssue;
          const twoDigitNumber = String(record.specialNumber).padStart(2, "0");
          return (
            <g
              key={record.calculationIssue}
              role="button"
              tabIndex={0}
              data-landing-issue={record.calculationIssue}
              aria-pressed={isFocused}
              aria-label={`${record.targetIssue}期，实际${record.actualLabel}，特码${twoDigitNumber}，${unitLabel}${record.count}，${record.rankLabel}`}
              className={cn("rq-formula-landing-chart__point", isFocused && "is-focused")}
              onClick={() => onFocusIssue(record.calculationIssue)}
              onKeyDown={(event) => handleKeyDown(event, record.calculationIssue)}
            >
              <rect
                x={x - barWidth / 2}
                y={countY}
                width={barWidth}
                height={baseline - countY}
                rx="5"
                className="rq-formula-landing-chart__bar"
              />
              <text x={x} y={Math.max(top + 13, countY - 7)} textAnchor="middle" className="rq-formula-landing-chart__count-label">
                {record.count}
              </text>
              <circle cx={x} cy={rankY} r={isFocused ? 6 : 5} className="rq-formula-landing-chart__rank-dot" />
              <text x={x + 10} y={Math.max(top + 12, rankY - 9)} className="rq-formula-landing-chart__direct-label">
                {record.actualLabel} · {twoDigitNumber}
              </text>
              <text x={x} y={height - 30} textAnchor="middle" className="rq-formula-landing-chart__axis-label">
                {record.calculationIssue}
              </text>
            </g>
          );
        })}

        <text x={left + plotWidth / 2} y={height - 8} textAnchor="middle" className="rq-formula-landing-chart__axis-title">
          计算期
        </text>
      </svg>
      <div className="rq-formula-landing-chart__legend" aria-label="组合图图例">
        <span className="is-count"><i />柱 · {unitLabel}</span>
        <span className="is-rank"><i />线 · 当期位置</span>
        {records.length >= 2 && <span className="is-average"><i />平均次数</span>}
      </div>
    </div>
  );
}
