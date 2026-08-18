"use client";

import { Fragment, type CSSProperties } from "react";
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

function MatrixCell({
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
}

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
