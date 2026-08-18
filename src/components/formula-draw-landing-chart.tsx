"use client";

import { useState, type KeyboardEvent } from "react";
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

function rankTicks(maxRank: number): number[] {
  const tickCount = Math.min(5, maxRank);
  if (tickCount === 1) return [1];
  return Array.from({ length: tickCount }, (_, index) => (
    Math.round(1 + index / (tickCount - 1) * (maxRank - 1))
  )).filter((rank, index, ranks) => ranks.indexOf(rank) === index);
}

export function FormulaDrawLandingChart({
  records,
  focusedIssue,
  unitLabel,
  onFocusIssue,
  onFocusRecord,
}: {
  records: FormulaDrawLandingRecord[];
  focusedIssue: string;
  unitLabel: string;
  onFocusIssue?: (issue: string) => void;
  onFocusRecord?: (record: FormulaDrawLandingRecord) => void;
}) {
  const [focusedControlIssue, setFocusedControlIssue] = useState<string | null>(null);

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
  const horizontalPadding = 36;
  const dataLeft = left + horizontalPadding;
  const dataWidth = plotWidth - horizontalPadding * 2;
  const baseline = top + plotHeight;
  const rankPoints = records.map((record, index) => ({
    x: xAt(index, records.length, dataLeft, dataWidth),
    y: yRank(record.rank),
  }));
  const countTicks = [maxCount, Math.round(maxCount / 2), 0].filter((value, index, values) => (
    values.indexOf(value) === index
  ));
  const visibleRankTicks = rankTicks(maxRank);
  const summary = records.map((record) => (
    `${record.targetIssue}期，实际${record.actualLabel}，特码${String(record.specialNumber).padStart(2, "0")}，${unitLabel}${record.count}，${record.rankLabel}`
  )).join("；");

  const focusRecord = (record: FormulaDrawLandingRecord) => {
    if (onFocusRecord) onFocusRecord(record);
    else onFocusIssue?.(record.calculationIssue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, record: FormulaDrawLandingRecord) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setFocusedControlIssue(record.calculationIssue);
      focusRecord(record);
    }
  };

  return (
    <div className="rq-formula-landing-chart">
      <div className="rq-formula-landing-chart__plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`实际开奖落点组合图，${records.length}个已开奖期；柱形为${unitLabel}，折线为当期位置，第1位在上；${summary}`}
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

        {visibleRankTicks.map((rank) => (
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
          const x = xAt(index, records.length, dataLeft, dataWidth);
          const countY = yCount(record.count);
          const rankY = yRank(record.rank);
          const isFocused = record.calculationIssue === focusedIssue;
          const isLast = index === records.length - 1;
          const twoDigitNumber = String(record.specialNumber).padStart(2, "0");
          return (
            <g key={record.calculationIssue} aria-hidden="true">
              <rect
                x={x - barWidth / 2}
                y={countY}
                width={barWidth}
                height={baseline - countY}
                rx="5"
                className={cn("rq-formula-landing-chart__bar", isFocused && "is-focused")}
              />
              <text x={x} y={Math.max(top + 13, countY - 7)} textAnchor="middle" className="rq-formula-landing-chart__count-label">
                {record.count}
              </text>
              <circle cx={x} cy={rankY} r={isFocused ? 6 : 5} className={cn("rq-formula-landing-chart__rank-dot", isFocused && "is-focused")} />
              <text
                x={x + (isLast ? -10 : 10)}
                y={Math.max(top + 12, rankY - 9)}
                textAnchor={isLast ? "end" : "start"}
                className="rq-formula-landing-chart__direct-label"
              >
                {record.actualLabel} · {twoDigitNumber}
              </text>
              <text x={x} y={height - 30} textAnchor="middle" className="rq-formula-landing-chart__axis-label is-target-issue">
                {record.targetIssue}
              </text>
            </g>
          );
        })}

        <text x={left + plotWidth / 2} y={height - 8} textAnchor="middle" className="rq-formula-landing-chart__axis-title">
          开奖期
        </text>
        </svg>
        <div className="rq-formula-landing-chart__controls" aria-label="实际开奖落点期次控制">
          {records.map((record, index) => {
            const x = xAt(index, records.length, dataLeft, dataWidth);
            const rankY = yRank(record.rank);
            const twoDigitNumber = String(record.specialNumber).padStart(2, "0");
            const isFocused = record.calculationIssue === focusedIssue;
            const isKeyboardFocused = record.calculationIssue === focusedControlIssue;
            return (
              <button
                key={record.calculationIssue}
                type="button"
                data-landing-issue={record.calculationIssue}
                aria-pressed={isFocused}
                aria-label={`${record.targetIssue}期，实际${record.actualLabel}，特码${twoDigitNumber}，${unitLabel}${record.count}，${record.rankLabel}`}
                className={cn(
                  "rq-formula-landing-chart__point",
                  isFocused && "is-focused",
                  isKeyboardFocused && "is-keyboard-focused",
                )}
                style={{ left: `${x / width * 100}%`, top: `${rankY / height * 100}%`, width: 44, height: 44 }}
                onClick={() => focusRecord(record)}
                onKeyDown={(event) => handleKeyDown(event, record)}
                onFocus={() => setFocusedControlIssue(record.calculationIssue)}
                onBlur={() => setFocusedControlIssue((current) => (
                  current === record.calculationIssue ? null : current
                ))}
              >
                <span className="rq-formula-landing-chart__focus-halo" aria-hidden="true" />
                <span className="sr-only">选择 {record.targetIssue} 期开奖落点</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rq-formula-landing-chart__legend" aria-label="组合图图例">
        <span className="is-count"><i />柱 · {unitLabel}</span>
        <span className="is-rank"><i />线 · 当期位置</span>
        {records.length >= 2 && <span className="is-average"><i />平均次数</span>}
      </div>
    </div>
  );
}
