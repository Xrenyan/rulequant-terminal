"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { BarChart3, ChartSpline, ChevronRight, ListChecks, X } from "lucide-react";
import {
  buildFormulaSummaryGroups,
  formulaSummaryTargetLabel,
  type FormulaSummaryAction,
  type FormulaSummaryContribution,
  type FormulaSummaryPeriod,
  type FormulaSummaryTarget,
  type FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FormulaResultVisualizationDialogProps = {
  periods: FormulaSummaryPeriod[];
  action: FormulaSummaryAction;
  targetType: FormulaSummaryTargetType;
  selectedTargetKey: string;
  onSelectTarget: (targetKey: string) => void;
  onClose: () => void;
  returnFocusRef: MutableRefObject<HTMLElement | null>;
};

function keyForTarget(target: FormulaSummaryTarget): string {
  return `${typeof target}:${String(target)}`;
}

function countTarget(period: FormulaSummaryPeriod, action: FormulaSummaryAction, targetType: FormulaSummaryTargetType, selectedKey: string): number {
  let count = 0;
  for (const contribution of period.contributions) {
    if (contribution.action !== action || contribution.targetType !== targetType) continue;
    if (contribution.targets.some((target) => keyForTarget(target) === selectedKey)) count += 1;
  }
  return count;
}

function affectedLabel(contribution: FormulaSummaryContribution): string {
  return contribution.affectedTargets?.map((target) => (
    typeof target === "number" ? String(target).padStart(2, "0") : String(target)
  )).join("、") ?? "";
}

function FormulaTrend({ periods, values, label }: { periods: FormulaSummaryPeriod[]; values: number[]; label: string }) {
  const maxValue = Math.max(1, ...values);
  if (periods.length < 4) {
    return (
      <div className="rq-formula-viz__period-bars" aria-label={`${label}分期次数`}>
        {periods.map((period, index) => (
          <div key={period.calculationIssue}>
            <span>{period.calculationIssue}</span>
            <i><b style={{ width: `${values[index] / maxValue * 100}%` }} /></i>
            <strong>{values[index]}</strong>
          </div>
        ))}
      </div>
    );
  }

  const width = 620;
  const height = 190;
  const left = 34;
  const right = 22;
  const top = 22;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = values.map((value, index) => ({
    x: left + (periods.length === 1 ? 0 : index / (periods.length - 1) * plotWidth),
    y: top + plotHeight - value / maxValue * plotHeight,
    value,
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <div className="rq-formula-viz__trend-wrap">
      <svg
        className="rq-formula-viz__trend"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}在${periods.length}个计算期的次数依次为${values.join("、")}`}
      >
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} className="rq-formula-viz__axis" />
        <path d={path} className="rq-formula-viz__trend-line" />
        {points.map((point, index) => (
          <g key={periods[index].calculationIssue}>
            <circle cx={point.x} cy={point.y} r="4.5" className="rq-formula-viz__trend-dot" />
            <text x={point.x} y={Math.max(13, point.y - 10)} textAnchor="middle" className="rq-formula-viz__trend-value">{point.value}</text>
            <text x={point.x} y={height - 10} textAnchor="middle" className="rq-formula-viz__trend-period">{periods[index].calculationIssue}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function FormulaResultVisualizationDialog({
  periods,
  action,
  targetType,
  selectedTargetKey,
  onSelectTarget,
  onClose,
  returnFocusRef,
}: FormulaResultVisualizationDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => buildFormulaSummaryGroups(periods), [periods]);
  const group = groups.find((candidate) => candidate.action === action && candidate.targetType === targetType);
  const selectedItem = group?.items.find((item) => item.targetKey === selectedTargetKey) ?? group?.items[0];
  const leadingItems = group?.items.slice(0, 6) ?? [];
  const selectedValues = selectedItem
    ? periods.map((period) => countTarget(period, action, targetType, selectedItem.targetKey))
    : [];
  const unitLabel = action === "exclude" ? "被排除次数" : "被支持次数";
  const title = `${formulaSummaryTargetLabel(targetType)} · ${unitLabel}`;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest<HTMLElement>('[role="dialog"]');
      const controls = dialog
        ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])')]
        : [];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => returnFocusElement?.focus());
    };
  }, [onClose, returnFocusRef]);

  return createPortal(
    <div className={cn("rq-formula-viz", action === "exclude" && "is-exclude")} role="presentation">
      <button type="button" className="rq-formula-viz__backdrop" aria-label="关闭可视化" onClick={onClose} />
      <section
        className="rq-formula-viz__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="formula-visualization-title"
        aria-describedby="formula-visualization-description"
      >
        <div className="rq-formula-viz__handle" aria-hidden="true" />
        <header className="rq-formula-viz__toolbar">
          <div className="rq-formula-viz__toolbar-icon"><BarChart3 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <span>公式结果统计 · 可视化详情</span>
            <h2 id="formula-visualization-title">{title}</h2>
            <p id="formula-visualization-description">{periods.length} 个计算期 · 每条公式每个唯一结果计 1 次</p>
          </div>
          <button ref={closeRef} type="button" className="rq-formula-viz__close" aria-label="关闭公式结果可视化" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>

        <div className="rq-formula-viz__body">
          <section className="rq-formula-viz__rank-panel" aria-labelledby="formula-rank-title">
            <header><div><span>完整比较</span><h3 id="formula-rank-title">公式贡献排行</h3></div><Badge tone={action === "exclude" ? "rose" : "cyan"}>{group?.items.length ?? 0} 个结果</Badge></header>
            <div className="rq-formula-viz__rank-list">
              {group?.items.map((item, index) => {
                const maxCount = group.items[0]?.count ?? 1;
                const active = selectedItem?.targetKey === item.targetKey;
                return (
                  <button
                    key={item.targetKey}
                    type="button"
                    aria-pressed={active}
                    className={cn(active && "is-active")}
                    onClick={() => onSelectTarget(item.targetKey)}
                  >
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    <b>{item.label}</b>
                    <i aria-hidden="true"><em style={{ width: `${Math.max(4, item.count / maxCount * 100)}%` }} /></i>
                    <strong>{item.count}<span>次</span></strong>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rq-formula-viz__trend-panel" aria-labelledby="formula-trend-title">
            <header>
              <div><span>{selectedItem?.label ?? "-"} · 精确期次</span><h3 id="formula-trend-title">最近十期变化</h3></div>
              <ChartSpline className="h-5 w-5" />
            </header>
            {selectedItem ? <FormulaTrend periods={periods} values={selectedValues} label={selectedItem.label} /> : <p className="rq-formula-viz__empty">暂无可视化数据</p>}
            <div className="rq-formula-viz__trend-summary">
              <span>累计<strong>{selectedValues.reduce((sum, value) => sum + value, 0)}</strong>次</span>
              <span>单期最高<strong>{Math.max(0, ...selectedValues)}</strong>次</span>
              <span>统计单位<strong>公式条数</strong></span>
            </div>
          </section>

          <section className="rq-formula-viz__matrix-panel" aria-labelledby="formula-matrix-title">
            <header><div><span>期次 × 前六结果</span><h3 id="formula-matrix-title">期次分布矩阵</h3></div><p>数字为该期贡献公式条数，色深仅辅助比较</p></header>
            <div className="rq-formula-viz__matrix-scroll">
              <div className="rq-formula-viz__matrix" style={{ gridTemplateColumns: `minmax(92px, 1.2fr) repeat(${leadingItems.length}, minmax(62px, 1fr))` }}>
                <span className="rq-formula-viz__matrix-corner">计算期</span>
                {leadingItems.map((item) => <strong key={item.targetKey}>{item.label}</strong>)}
                {periods.map((period) => {
                  const counts = leadingItems.map((item) => countTarget(period, action, targetType, item.targetKey));
                  const rowMax = Math.max(1, ...counts);
                  return [
                    <span key={`${period.calculationIssue}:label`} className="rq-formula-viz__matrix-period">{period.calculationIssue}<small>→ {period.targetLabel}</small></span>,
                    ...counts.map((count, index) => (
                      <span
                        key={`${period.calculationIssue}:${leadingItems[index].targetKey}`}
                        className="rq-formula-viz__matrix-cell"
                        style={{ "--rq-cell-strength": `${Math.round(6 + count / rowMax * 16)}%` } as CSSProperties}
                        aria-label={`${period.calculationIssue}期${leadingItems[index].label}${count}次`}
                      >{count}</span>
                    )),
                  ];
                })}
              </div>
            </div>
          </section>

          <section className="rq-formula-viz__evidence-panel" aria-labelledby="formula-evidence-title">
            <header><div><span>{selectedItem?.label ?? "-"} · 可追溯来源</span><h3 id="formula-evidence-title">贡献公式明细</h3></div><Badge tone="slate">{selectedItem?.contributions.length ?? 0} 条记录</Badge></header>
            <div className="rq-formula-viz__evidence-list">
              {selectedItem?.contributions.map((contribution) => {
                const affected = affectedLabel(contribution);
                return (
                  <details key={contribution.id} className="rq-formula-viz__evidence-row">
                    <summary>
                      <span><ListChecks className="h-4 w-4" /></span>
                      <div><strong>{contribution.ruleName}</strong><small>{contribution.calculationIssue} 计算 · {contribution.targetLabel} 对应</small></div>
                      <Badge tone={action === "exclude" ? "rose" : "cyan"}>{contribution.targets.join("、")}</Badge>
                      <ChevronRight className="h-4 w-4" />
                    </summary>
                    <div className="rq-formula-viz__evidence-detail">
                      <p><span>公式</span><code>{contribution.formula}</code></p>
                      <p><span>表达式</span><code>{contribution.expression}</code></p>
                      {affected && <p><span>影响号码</span><b>{affected}</b></p>}
                      <ol>{contribution.process.map((line, index) => <li key={`${contribution.id}:line:${index}`}>{line}</li>)}</ol>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}
