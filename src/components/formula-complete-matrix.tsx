"use client";

import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Target } from "lucide-react";
import type {
  FormulaDrawLandingAnalysis,
  FormulaDrawLandingRecord,
  FormulaLandingDomainItem,
} from "@/lib/formula-summary/formula-draw-landing";
import type {
  FormulaSummaryPeriod,
  FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";
import { cn } from "@/lib/utils";

export type FormulaCompleteMatrixProps = {
  analysis: FormulaDrawLandingAnalysis;
  targetType: FormulaSummaryTargetType;
  selectedTargetKey: string;
  focusedIssue: string;
  onFocusActualRecord?: (record: FormulaDrawLandingRecord) => void;
  onSelectTarget: (targetKey: string) => void;
  onFocusIssue: (issue: string) => void;
};

type MatrixCellProps = {
  item: FormulaLandingDomainItem;
  period: FormulaSummaryPeriod;
  count: number;
  globalMax: number;
  actual?: FormulaDrawLandingRecord;
  selectedTargetKey: string;
  focusedIssue: string;
  numberCell?: boolean;
  onFocusActualRecord?: (record: FormulaDrawLandingRecord) => void;
  onSelectTarget: (targetKey: string) => void;
  onFocusIssue: (issue: string) => void;
};

function heatStyle(count: number, globalMax: number): CSSProperties {
  const strength = globalMax > 0 ? Math.round(count / globalMax * 100) : 0;
  return { "--rq-cell-strength": `${strength}%` } as CSSProperties;
}

function actualAriaLabel(record: FormulaDrawLandingRecord): string {
  const specialNumber = String(record.specialNumber).padStart(2, "0");
  return `${record.calculationIssue}计算期，${record.targetIssue}期开奖，特码${specialNumber}，实际开奖${record.actualLabel}，${record.count}次，当期位置${record.rankLabel}`;
}

function periodResultLabel(period: FormulaSummaryPeriod): string {
  return period.isPending ? "待开奖" : period.targetLabel;
}

function matrixCellAriaLabel(
  item: FormulaLandingDomainItem,
  period: FormulaSummaryPeriod,
  count: number,
  numberCell: boolean,
): string {
  return `${period.calculationIssue}计算期，${periodResultLabel(period)}，${numberCell ? "号码" : "结果"}${item.label}，${count}次`;
}

const MatrixCell = memo(function MatrixCell({
  item,
  period,
  count,
  globalMax,
  actual,
  selectedTargetKey,
  focusedIssue,
  numberCell = false,
  onFocusActualRecord,
  onSelectTarget,
  onFocusIssue,
}: MatrixCellProps) {
  const isActual = actual?.actualTargetKey === item.targetKey;
  const isSelected = selectedTargetKey === item.targetKey;
  const isFocused = focusedIssue === period.calculationIssue;
  const isMuted = focusedIssue !== "all" && !isFocused;
  const specialNumber = actual ? String(actual.specialNumber).padStart(2, "0") : "";
  const ariaLabel = isActual && actual
    ? actualAriaLabel(actual)
    : matrixCellAriaLabel(item, period, count, numberCell);

  return (
    <button
      type="button"
      data-matrix-cell={item.targetKey}
      data-number-cell={numberCell ? item.label : undefined}
      data-actual-landing={isActual ? "true" : undefined}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className={cn(
        numberCell
          ? "rq-formula-complete-matrix__number-cell"
          : "rq-formula-complete-matrix__cell",
        isActual && "is-actual",
        isSelected && "is-selected",
        isFocused && "is-focused",
        isMuted && "is-muted",
      )}
      style={heatStyle(count, globalMax)}
      onClick={() => {
        if (isActual && actual && onFocusActualRecord) {
          onFocusActualRecord(actual);
          return;
        }
        onSelectTarget(item.targetKey);
        onFocusIssue(period.calculationIssue);
      }}
    >
      {numberCell && <small>{item.label}</small>}
      <strong>{count}</strong>
      {isActual && (
        <span className="rq-formula-complete-matrix__actual-marker">
          <Target aria-hidden="true" />
          <small>{specialNumber}</small>
        </span>
      )}
    </button>
  );
});

function PeriodButton({
  period,
  focusedIssue,
  onFocusIssue,
}: {
  period: FormulaSummaryPeriod;
  focusedIssue: string;
  onFocusIssue: (issue: string) => void;
}) {
  const isFocused = focusedIssue === period.calculationIssue;
  return (
    <button
      type="button"
      data-period-issue={period.calculationIssue}
      aria-pressed={isFocused}
      className={cn("rq-formula-complete-matrix__period", isFocused && "is-focused")}
      onClick={() => onFocusIssue(period.calculationIssue)}
    >
      {period.calculationIssue}
      <small>→ {periodResultLabel(period)}</small>
    </button>
  );
}

function NumberMatrix({
  analysis,
  selectedTargetKey,
  focusedIssue,
  onFocusActualRecord,
  onSelectTarget,
  onFocusIssue,
}: Omit<FormulaCompleteMatrixProps, "targetType">) {
  const recordByIssue = new Map(analysis.records.map((record) => [record.calculationIssue, record]));
  const seriesByKey = new Map(analysis.series.map((series) => [series.targetKey, series]));

  return (
    <div className="rq-formula-complete-matrix is-number" role="region" aria-label="完整号码结果矩阵">
      {analysis.retainedMatrixIssue && (
        <p className="rq-formula-complete-matrix__retained" data-matrix-retained role="status">
          已保留聚焦计算期 {analysis.retainedMatrixIssue}，矩阵额外显示该期。
        </p>
      )}
      {analysis.matrixPeriods.map((period, periodIndex) => {
        const isFocused = focusedIssue === period.calculationIssue;
        return (
          <article
            key={period.calculationIssue}
            data-matrix-period={period.calculationIssue}
            className={cn(
              "rq-formula-complete-matrix__number-period",
              isFocused && "is-focused",
              focusedIssue !== "all" && !isFocused && "is-muted",
            )}
          >
            <header>
              <PeriodButton
                period={period}
                focusedIssue={focusedIssue}
                onFocusIssue={onFocusIssue}
              />
            </header>
            <div className="rq-formula-complete-matrix__number-grid">
              {analysis.domain.map((item) => (
                <MatrixCell
                  key={item.targetKey}
                  item={item}
                  period={period}
                  count={seriesByKey.get(item.targetKey)?.values[periodIndex] ?? 0}
                  globalMax={analysis.globalMax}
                  actual={recordByIssue.get(period.calculationIssue)}
                  selectedTargetKey={selectedTargetKey}
                  focusedIssue={focusedIssue}
                  numberCell
                  onFocusActualRecord={onFocusActualRecord}
                  onSelectTarget={onSelectTarget}
                  onFocusIssue={onFocusIssue}
                />
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function FormulaCompleteMatrix({
  analysis,
  targetType,
  selectedTargetKey,
  focusedIssue,
  onFocusActualRecord,
  onSelectTarget,
  onFocusIssue,
}: FormulaCompleteMatrixProps) {
  if (analysis.matrixPeriods.length > 12) {
    return <WindowedMatrix analysis={analysis} targetType={targetType} selectedTargetKey={selectedTargetKey} focusedIssue={focusedIssue} onFocusActualRecord={onFocusActualRecord} onSelectTarget={onSelectTarget} onFocusIssue={onFocusIssue} />;
  }
  if (targetType === "number") {
    return (
      <NumberMatrix
        analysis={analysis}
        selectedTargetKey={selectedTargetKey}
        focusedIssue={focusedIssue}
        onFocusActualRecord={onFocusActualRecord}
        onSelectTarget={onSelectTarget}
        onFocusIssue={onFocusIssue}
      />
    );
  }

  const recordByIssue = new Map(analysis.records.map((record) => [record.calculationIssue, record]));
  const seriesByKey = new Map(analysis.series.map((series) => [series.targetKey, series]));

  return (
    <div className={cn("rq-formula-complete-matrix", `is-${targetType}`)} role="region" aria-label="完整结果矩阵">
      {analysis.retainedMatrixIssue && (
        <p className="rq-formula-complete-matrix__retained" data-matrix-retained role="status">
          已保留聚焦计算期 {analysis.retainedMatrixIssue}，矩阵额外显示该期。
        </p>
      )}
      <div className="rq-formula-complete-matrix__scroll">
        <div
          className="rq-formula-complete-matrix__grid"
          style={{
            gridTemplateColumns: `minmax(112px, 1.25fr) repeat(${analysis.domain.length}, minmax(66px, 1fr))`,
          }}
        >
          <span className="rq-formula-complete-matrix__corner">计算期</span>
          {analysis.domain.map((item) => (
            <button
              key={item.targetKey}
              type="button"
              data-matrix-target={item.targetKey}
              aria-pressed={selectedTargetKey === item.targetKey}
              className={cn(
                "rq-formula-complete-matrix__target",
                selectedTargetKey === item.targetKey && "is-selected",
              )}
              onClick={() => onSelectTarget(item.targetKey)}
            >
              {item.label}
            </button>
          ))}
          {analysis.matrixPeriods.map((period, periodIndex) => (
            <Fragment key={period.calculationIssue}>
              <PeriodButton
                period={period}
                focusedIssue={focusedIssue}
                onFocusIssue={onFocusIssue}
              />
              {analysis.domain.map((item) => (
                <MatrixCell
                  key={`${period.calculationIssue}:${item.targetKey}`}
                  item={item}
                  period={period}
                  count={seriesByKey.get(item.targetKey)?.values[periodIndex] ?? 0}
                  globalMax={analysis.globalMax}
                  actual={recordByIssue.get(period.calculationIssue)}
                  selectedTargetKey={selectedTargetKey}
                  focusedIssue={focusedIssue}
                  onFocusActualRecord={onFocusActualRecord}
                  onSelectTarget={onSelectTarget}
                  onFocusIssue={onFocusIssue}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function WindowedMatrix({ analysis, targetType, selectedTargetKey, focusedIssue, onFocusActualRecord, onSelectTarget, onFocusIssue }: FormulaCompleteMatrixProps) {
  const numberCell = targetType === "number";
  const rowHeight = numberCell ? 448 : 56;
  const [query, setQuery] = useState("");
  const [scrollRow, setScrollRow] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const viewportRef = useRef<HTMLDivElement>(null);
  const periods = useMemo(() => analysis.matrixPeriods.map((period, index) => ({ period, index }))
    .filter(({ period }) => !query.trim() || `${period.calculationIssue} ${period.targetIssue ?? ""}`.includes(query.trim())), [analysis.matrixPeriods, query]);
  const recordByIssue = useMemo(() => new Map(analysis.records.map((record) => [record.calculationIssue, record])), [analysis.records]);
  const seriesByKey = useMemo(() => new Map(analysis.series.map((series) => [series.targetKey, series])), [analysis.series]);
  const first = Math.min(scrollRow, Math.max(0, periods.length - 1));
  const start = Math.max(0, first - 2);
  const end = Math.min(periods.length, first + Math.ceil(viewportHeight / rowHeight) + 3);
  const columns: CSSProperties = { gridTemplateColumns: `minmax(112px, 1.25fr) repeat(${analysis.domain.length}, minmax(66px, 1fr))` };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const syncViewport = () => {
      setScrollRow(Math.floor(viewport.scrollTop / rowHeight));
      setViewportHeight(viewport.clientHeight || 560);
    };
    syncViewport();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(syncViewport);
    observer?.observe(viewport);
    window.addEventListener("resize", syncViewport);
    return () => { observer?.disconnect(); window.removeEventListener("resize", syncViewport); };
  }, [rowHeight]);

  useEffect(() => {
    const index = periods.findIndex(({ period }) => period.calculationIssue === focusedIssue);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => {
      if (!viewportRef.current) return;
      const top = index * rowHeight;
      const height = viewportRef.current.clientHeight || 560;
      if (top < viewportRef.current.scrollTop || top + rowHeight > viewportRef.current.scrollTop + height) {
        viewportRef.current.scrollTop = top;
        setScrollRow(Math.floor(viewportRef.current.scrollTop / rowHeight));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedIssue, periods, rowHeight]);

  return <div className={cn("rq-formula-complete-matrix rq-matrix-window", `is-${targetType}`)} role="region" aria-label={numberCell ? "完整号码结果矩阵" : "完整结果矩阵"}>
    <div className="rq-matrix-window__toolbar">
      <label><span>查找期次</span><input aria-label="搜索矩阵期次" value={query} placeholder="计算期或开奖期" onChange={(event) => { setQuery(event.target.value); setScrollRow(0); if (viewportRef.current) viewportRef.current.scrollTop = 0; }} /></label>
      <label><span>快速定位</span><select aria-label="跳转矩阵计算期" value="" onChange={(event) => {
        const issue = event.target.value;
        if (!issue) return;
        const index = analysis.matrixPeriods.findIndex((period) => period.calculationIssue === issue);
        setQuery(""); setScrollRow(index);
        if (viewportRef.current) viewportRef.current.scrollTop = index * rowHeight;
        onFocusIssue(issue);
      }}><option value="">选择计算期</option>{analysis.matrixPeriods.map((period) => <option key={period.calculationIssue} value={period.calculationIssue}>{period.calculationIssue} → {periodResultLabel(period)}</option>)}</select></label>
      <span role="status">{periods.length} / {analysis.matrixPeriods.length} 期 · 每期 {analysis.domain.length} 项</span>
    </div>
    {analysis.retainedMatrixIssue && <p className="rq-formula-complete-matrix__retained" data-matrix-retained>已保留聚焦计算期 {analysis.retainedMatrixIssue}，矩阵额外显示该期。</p>}
    <div ref={viewportRef} className="rq-matrix-window__viewport" data-matrix-viewport onScroll={(event) => setScrollRow(Math.floor(event.currentTarget.scrollTop / rowHeight))}>
      {!numberCell && <div className="rq-matrix-window__head rq-formula-complete-matrix__grid" style={columns}><span className="rq-formula-complete-matrix__corner">计算期</span>{analysis.domain.map((item) => <button key={item.targetKey} type="button" data-matrix-target={item.targetKey} aria-pressed={selectedTargetKey === item.targetKey} className={cn("rq-formula-complete-matrix__target", selectedTargetKey === item.targetKey && "is-selected")} onClick={() => onSelectTarget(item.targetKey)}>{item.label}</button>)}</div>}
      <div className="rq-matrix-window__space" style={{ height: periods.length * rowHeight, minWidth: numberCell ? undefined : 112 + analysis.domain.length * 71 }}>
        {periods.slice(start, end).map(({ period, index }, visibleIndex) => <article key={period.calculationIssue} data-matrix-period={period.calculationIssue} data-period-index={index} className={cn("rq-matrix-window__row", numberCell ? "rq-formula-complete-matrix__number-period" : "rq-formula-complete-matrix__grid", focusedIssue === period.calculationIssue && "is-focused")} style={{ ...(numberCell ? {} : columns), position: "absolute", top: (start + visibleIndex) * rowHeight, height: rowHeight - 10, left: 0, right: 0 }}>
          {numberCell ? <header><PeriodButton period={period} focusedIssue={focusedIssue} onFocusIssue={onFocusIssue} /></header> : <PeriodButton period={period} focusedIssue={focusedIssue} onFocusIssue={onFocusIssue} />}
          <div className={numberCell ? "rq-formula-complete-matrix__number-grid" : "rq-matrix-window__cells"}>{analysis.domain.map((item) => <MatrixCell key={item.targetKey} item={item} period={period} count={seriesByKey.get(item.targetKey)?.values[index] ?? 0} globalMax={analysis.globalMax} actual={recordByIssue.get(period.calculationIssue)} selectedTargetKey={selectedTargetKey} focusedIssue={focusedIssue} numberCell={numberCell} onFocusActualRecord={onFocusActualRecord} onSelectTarget={onSelectTarget} onFocusIssue={onFocusIssue} />)}</div>
        </article>)}
      </div>
      {!periods.length && <p className="rq-matrix-window__empty">没有找到匹配期次</p>}
    </div>
  </div>;
}
