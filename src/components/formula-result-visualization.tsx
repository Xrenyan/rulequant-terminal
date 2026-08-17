"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { ChartSpline, ChevronRight, ListChecks, X } from "lucide-react";
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

function FormulaTrend({
  periods,
  values,
  label,
  focusedIssue,
  onFocusPeriod,
}: {
  periods: FormulaSummaryPeriod[];
  values: number[];
  label: string;
  focusedIssue: string;
  onFocusPeriod: (issue: string) => void;
}) {
  const maxValue = Math.max(1, ...values);
  const width = 620;
  const height = 190;
  const left = 34;
  const right = 22;
  const top = 22;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = values.map((value, index) => ({
    x: left + (periods.length === 1 ? plotWidth / 2 : index / (periods.length - 1) * plotWidth),
    y: top + plotHeight - value / maxValue * plotHeight,
    value,
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = points.length
    ? `${path} L${points.at(-1)?.x.toFixed(1)} ${top + plotHeight} L${points[0].x.toFixed(1)} ${top + plotHeight} Z`
    : "";
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const averageY = top + plotHeight - average / maxValue * plotHeight;

  return (
    <div className="rq-formula-viz__trend-wrap">
      <svg
        className="rq-formula-viz__trend"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}在${periods.length}个计算期的次数依次为${values.join("、")}`}
      >
        <defs>
          <linearGradient id="rq-formula-trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="rq-formula-viz__trend-area-start" />
            <stop offset="100%" className="rq-formula-viz__trend-area-end" />
          </linearGradient>
        </defs>
        {[0, .5, 1].map((ratio) => (
          <line key={ratio} x1={left} y1={top + plotHeight * ratio} x2={width - right} y2={top + plotHeight * ratio} className="rq-formula-viz__grid-line" />
        ))}
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} className="rq-formula-viz__axis" />
        <line x1={left} y1={averageY} x2={width - right} y2={averageY} className="rq-formula-viz__average-line" />
        <text x={width - right} y={Math.max(12, averageY - 6)} textAnchor="end" className="rq-formula-viz__average-label">均值 {average.toFixed(1)}</text>
        {areaPath && <path d={areaPath} className="rq-formula-viz__trend-area" />}
        <path d={path} className="rq-formula-viz__trend-line" />
        {points.map((point, index) => (
          <g key={periods[index].calculationIssue} className={focusedIssue === periods[index].calculationIssue ? "is-focused" : undefined}>
            <circle cx={point.x} cy={point.y} r="4.5" className="rq-formula-viz__trend-dot" />
            <text x={point.x} y={Math.max(13, point.y - 10)} textAnchor="middle" className="rq-formula-viz__trend-value">{point.value}</text>
            <text x={point.x} y={height - 10} textAnchor="middle" className="rq-formula-viz__trend-period">{periods[index].calculationIssue}</text>
          </g>
        ))}
      </svg>
      <div className="rq-formula-viz__period-filter" aria-label={`${label}期次筛选`}>
        {periods.map((period, index) => (
          <button
            key={period.calculationIssue}
            type="button"
            data-period-issue={period.calculationIssue}
            aria-pressed={focusedIssue === period.calculationIssue}
            className={focusedIssue === period.calculationIssue ? "is-active" : undefined}
            onClick={() => onFocusPeriod(period.calculationIssue)}
          >
            <span>{period.calculationIssue}</span>
            <strong>{values[index]}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function buildRuleStructure(contributions: FormulaSummaryContribution[]) {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const contribution of contributions) {
    const current = counts.get(contribution.ruleId);
    if (current) current.count += 1;
    else counts.set(contribution.ruleId, { id: contribution.ruleId, name: contribution.ruleName, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function FormulaComposition({
  items,
  selectedTargetKey,
  onSelectTarget,
}: {
  items: Array<{ targetKey: string; label: string; count: number }>;
  selectedTargetKey?: string;
  onSelectTarget: (targetKey: string) => void;
}) {
  const selected = items.find((item) => item.targetKey === selectedTargetKey) ?? items[0];
  const leadingItems = items.slice(0, 6);
  const visibleItems = selected && !leadingItems.some((item) => item.targetKey === selected.targetKey)
    ? [...items.slice(0, 5), selected]
    : leadingItems;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const segments = visibleItems.map((item, index) => {
    const portion = total ? item.count / total * 100 : 0;
    const offset = total
      ? visibleItems.slice(0, index).reduce((sum, candidate) => sum + candidate.count / total * 100, 0)
      : 0;
    return { ...item, portion, offset, colorIndex: index };
  });
  const selectedShare = selected && total ? selected.count / total * 100 : 0;

  return (
    <div className="rq-formula-viz__composition">
      <div className="rq-formula-viz__donut-wrap">
        <svg className="rq-formula-viz__donut" viewBox="0 0 120 120" role="img" aria-label="各结果贡献次数构成环图">
          <circle cx="60" cy="60" r="42" pathLength="100" className="rq-formula-viz__donut-base" />
          {segments.map((segment) => (
            <circle
              key={segment.targetKey}
              cx="60"
              cy="60"
              r="42"
              pathLength="100"
              className={cn(`rq-formula-viz__donut-segment color-${segment.colorIndex + 1}`, selected?.targetKey === segment.targetKey && "is-selected")}
              strokeDasharray={`${Math.max(0, segment.portion - 1.2)} ${100 - Math.max(0, segment.portion - 1.2)}`}
              strokeDashoffset={-segment.offset}
              onClick={() => onSelectTarget(segment.targetKey)}
            />
          ))}
        </svg>
        <div className="rq-formula-viz__donut-center"><strong>{selected?.count ?? 0}</strong><span>{selectedShare.toFixed(1)}%</span></div>
      </div>
      <div className="rq-formula-viz__composition-legend">
        {visibleItems.map((item, index) => (
          <button
            key={item.targetKey}
            type="button"
            data-chart-target={item.targetKey}
            aria-pressed={selected?.targetKey === item.targetKey}
            className={cn(selected?.targetKey === item.targetKey && "is-active")}
            onClick={() => onSelectTarget(item.targetKey)}
          >
            <i className={`color-${index + 1}`} />
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>
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
  const [focusedIssue, setFocusedIssue] = useState("all");
  const groups = useMemo(() => buildFormulaSummaryGroups(periods), [periods]);
  const group = groups.find((candidate) => candidate.action === action && candidate.targetType === targetType);
  const selectedItem = group?.items.find((item) => item.targetKey === selectedTargetKey) ?? group?.items[0];
  const groupLeadingItems = group?.items.slice(0, 6) ?? [];
  const leadingItems = selectedItem && !groupLeadingItems.some((item) => item.targetKey === selectedItem.targetKey)
    ? [...(group?.items.slice(0, 5) ?? []), selectedItem]
    : groupLeadingItems;
  const selectedValues = selectedItem
    ? periods.map((period) => countTarget(period, action, targetType, selectedItem.targetKey))
    : [];
  const unitLabel = action === "exclude" ? "被排除次数" : "被支持次数";
  const title = `${formulaSummaryTargetLabel(targetType)} · ${unitLabel}`;
  const selectedTotal = selectedValues.reduce((sum, value) => sum + value, 0);
  const selectedShare = selectedItem && group?.totalCount ? selectedItem.count / group.totalCount * 100 : 0;
  const activePeriods = selectedValues.filter((value) => value > 0).length;
  const focusedPeriodIndex = periods.findIndex((period) => period.calculationIssue === focusedIssue);
  const focusedPeriod = focusedPeriodIndex >= 0 ? periods[focusedPeriodIndex] : undefined;
  const focusedTotal = focusedPeriod?.contributions.reduce((sum, contribution) => (
    contribution.action === action && contribution.targetType === targetType
      ? sum + new Set(contribution.targets.map(keyForTarget)).size
      : sum
  ), 0) ?? group?.totalCount ?? 0;
  const displayedSelectedTotal = focusedPeriod ? selectedValues[focusedPeriodIndex] ?? 0 : selectedTotal;
  const displayedSelectedShare = focusedTotal ? displayedSelectedTotal / focusedTotal * 100 : selectedShare;
  const displayedActivePeriods = focusedPeriod ? Number(displayedSelectedTotal > 0) : activePeriods;
  const displayedPeriodCount = focusedPeriod ? 1 : periods.length;
  const selectedContributions = selectedItem?.contributions.filter((contribution) => (
    focusedIssue === "all" || contribution.calculationIssue === focusedIssue
  )) ?? [];
  const uniqueRuleCount = new Set(selectedContributions.map((contribution) => contribution.ruleId)).size;
  const ruleStructure = buildRuleStructure(selectedContributions);
  const ruleStructureMax = ruleStructure[0]?.count ?? 1;

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
        <div className="rq-formula-viz__handle rq-mobile-more__handle" aria-hidden="true" />
        <header className="rq-formula-viz__toolbar">
          <div className="min-w-0">
            <span>公式结果统计 · 联动分析</span>
            <h2 id="formula-visualization-title">{title}</h2>
            <p id="formula-visualization-description">{periods.length} 个计算期 · 每条公式每个唯一结果计 1 次</p>
          </div>
          <button ref={closeRef} type="button" className="rq-formula-viz__close rq-mobile-more__close" aria-label="关闭公式结果可视化" onClick={onClose}><X className="h-5 w-5" /></button>
        </header>

        <div className="rq-formula-viz__body">
          <section className="rq-formula-viz__overview" aria-labelledby="formula-overview-title">
            <header>
              <div><span>关键指标</span><h3 id="formula-overview-title">分析概览</h3></div>
              {focusedIssue !== "all" && (
                <div className="rq-formula-viz__active-filter">
                  <span>已聚焦计算期</span><strong>{focusedIssue}</strong>
                  <button type="button" onClick={() => setFocusedIssue("all")}>清除期次筛选</button>
                </div>
              )}
            </header>
            <div className="rq-formula-viz__kpis">
              <article><span>当前结果累计</span><strong>{displayedSelectedTotal}<small>次</small></strong><p>{selectedItem?.label ?? "-"}在当前筛选的精确次数</p></article>
              <article><span>结果贡献占比</span><strong>{displayedSelectedShare.toFixed(1)}<small>%</small></strong><p>占{group?.label ?? "当前类型"}当前筛选贡献</p></article>
              <article><span>活跃计算期</span><strong>{displayedActivePeriods}<small>/{displayedPeriodCount}</small></strong><p>至少有一条公式产生该结果</p></article>
              <article><span>贡献公式数</span><strong>{uniqueRuleCount}<small>条</small></strong><p>{focusedIssue === "all" ? "已自动去重" : `${focusedIssue}期筛选结果`}</p></article>
            </div>
          </section>

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
                    data-chart-target={item.targetKey}
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
              <div><span>{selectedItem?.label ?? "-"} · 精确期次</span><h3 id="formula-trend-title">{periods.length > 1 ? "最近十期变化" : "本期次数"}</h3></div>
              <ChartSpline className="h-5 w-5" />
            </header>
            {selectedItem ? (
              <FormulaTrend
                periods={periods}
                values={selectedValues}
                label={selectedItem.label}
                focusedIssue={focusedIssue}
                onFocusPeriod={(issue) => setFocusedIssue((current) => current === issue ? "all" : issue)}
              />
            ) : <p className="rq-formula-viz__empty">暂无可视化数据</p>}
            <div className="rq-formula-viz__trend-summary">
              <span>累计<strong>{selectedTotal}</strong>次</span>
              <span>单期最高<strong>{Math.max(0, ...selectedValues)}</strong>次</span>
              <span>统计单位<strong>公式条数</strong></span>
            </div>
          </section>

          <section className="rq-formula-viz__composition-panel" aria-labelledby="formula-composition-title">
            <header><div><span>贡献占比 · 点击联动</span><h3 id="formula-composition-title">结果构成</h3></div><Badge tone="slate">前 6 项</Badge></header>
            <FormulaComposition
              items={group?.items ?? []}
              selectedTargetKey={selectedItem?.targetKey}
              onSelectTarget={onSelectTarget}
            />
          </section>

          <section className="rq-formula-viz__rules-panel" aria-labelledby="formula-rules-title">
            <header><div><span>{focusedIssue === "all" ? "完整范围" : `${focusedIssue} 计算期`} · 帕累托视图</span><h3 id="formula-rules-title">公式贡献结构</h3></div><p>柱长为贡献次数，右侧为累计占比</p></header>
            <div className="rq-formula-viz__rule-bars">
              {ruleStructure.slice(0, 10).map((rule, index) => {
                const cumulative = ruleStructure.slice(0, index + 1).reduce((sum, item) => sum + item.count, 0);
                const cumulativeShare = selectedContributions.length ? cumulative / selectedContributions.length * 100 : 0;
                return (
                  <div key={rule.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b title={rule.name}>{rule.name}</b>
                    <i aria-hidden="true"><em style={{ width: `${Math.max(5, rule.count / ruleStructureMax * 100)}%` }} /></i>
                    <strong>{rule.count}<small>次</small></strong>
                    <small>{cumulativeShare.toFixed(0)}%</small>
                  </div>
                );
              })}
              {!ruleStructure.length && <p className="rq-formula-viz__empty">当前筛选暂无公式贡献</p>}
            </div>
          </section>

          <section className="rq-formula-viz__matrix-panel" aria-labelledby="formula-matrix-title">
            <header><div><span>期次 × 前六结果 · 点击交叉筛选</span><h3 id="formula-matrix-title">{periods.length > 1 ? "期次分布矩阵" : "本期结果对比"}</h3></div><p>数字为该期贡献公式条数，色深表示相对强度</p></header>
            <div className="rq-formula-viz__matrix-scroll">
              <div className="rq-formula-viz__matrix" style={{ gridTemplateColumns: `minmax(92px, 1.2fr) repeat(${leadingItems.length}, minmax(62px, 1fr))` }}>
                <span className="rq-formula-viz__matrix-corner">计算期</span>
                {leadingItems.map((item) => (
                  <button key={item.targetKey} type="button" data-chart-target={item.targetKey} aria-pressed={selectedItem?.targetKey === item.targetKey} className="rq-formula-viz__matrix-target" onClick={() => onSelectTarget(item.targetKey)}>{item.label}</button>
                ))}
                {periods.map((period) => {
                  const counts = leadingItems.map((item) => countTarget(period, action, targetType, item.targetKey));
                  const rowMax = Math.max(1, ...counts);
                  return [
                    <button key={`${period.calculationIssue}:label`} type="button" data-period-issue={period.calculationIssue} aria-pressed={focusedIssue === period.calculationIssue} className="rq-formula-viz__matrix-period" onClick={() => setFocusedIssue((current) => current === period.calculationIssue ? "all" : period.calculationIssue)}>{period.calculationIssue}<small>→ {period.targetLabel}</small></button>,
                    ...counts.map((count, index) => (
                      <button
                        type="button"
                        key={`${period.calculationIssue}:${leadingItems[index].targetKey}`}
                        className={cn("rq-formula-viz__matrix-cell", focusedIssue !== "all" && focusedIssue !== period.calculationIssue && "is-muted")}
                        style={{ "--rq-cell-strength": `${Math.round(6 + count / rowMax * 16)}%` } as CSSProperties}
                        aria-label={`${period.calculationIssue}期${leadingItems[index].label}${count}次`}
                        onClick={() => {
                          onSelectTarget(leadingItems[index].targetKey);
                          setFocusedIssue(period.calculationIssue);
                        }}
                      >{count}</button>
                    )),
                  ];
                })}
              </div>
            </div>
          </section>

          <section className="rq-formula-viz__evidence-panel" aria-labelledby="formula-evidence-title">
            <header><div><span>{selectedItem?.label ?? "-"} · {focusedIssue === "all" ? "完整范围" : `${focusedIssue} 计算期`} · 可追溯来源</span><h3 id="formula-evidence-title">贡献公式明细</h3></div><Badge tone="slate">{selectedContributions.length} 条记录</Badge></header>
            <div className="rq-formula-viz__evidence-list">
              {selectedContributions.map((contribution) => {
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
