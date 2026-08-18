"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { ChartSpline, ChevronRight, ListChecks, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  FormulaComparisonTrend,
  FormulaParetoChart,
  FormulaRankTrajectory,
} from "@/components/formula-visualization-charts";
import { FormulaDrawLandingChart } from "@/components/formula-draw-landing-chart";
import { FormulaCompleteMatrix } from "@/components/formula-complete-matrix";
import {
  buildFormulaSummaryGroups,
  formulaSummaryTargetLabel,
  type FormulaSummaryAction,
  type FormulaSummaryContribution,
  type FormulaSummaryPeriod,
  type FormulaSummaryTarget,
  type FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";
import {
  buildFormulaInsight,
  buildFormulaParetoRows,
  buildFormulaVisualizationModel,
  selectRankSeries,
} from "@/lib/formula-summary/formula-visualization";
import {
  buildFormulaDrawLandingAnalysis,
  formulaTargetKey,
  type FormulaDrawLandingRecord,
} from "@/lib/formula-summary/formula-draw-landing";
import type { RuleQuantConfig } from "@/types/domain";
import { cn } from "@/lib/utils";

export type FormulaResultVisualizationDialogProps = {
  periods: FormulaSummaryPeriod[];
  config: RuleQuantConfig;
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

function displayTarget(target: FormulaSummaryTarget): string {
  return typeof target === "number" ? String(target).padStart(2, "0") : String(target);
}

function affectedLabel(contribution: FormulaSummaryContribution): string {
  return contribution.affectedTargets?.map(displayTarget).join("、") ?? "";
}

export function FormulaResultVisualizationDialog({
  periods,
  config,
  action,
  targetType,
  selectedTargetKey,
  onSelectTarget,
  onClose,
  returnFocusRef,
}: FormulaResultVisualizationDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [focusedLandingIssue, setFocusedLandingIssue] = useState("all");
  const groups = useMemo(() => buildFormulaSummaryGroups(periods), [periods]);
  const model = useMemo(
    () => buildFormulaVisualizationModel(periods, action, targetType),
    [action, periods, targetType],
  );
  const landing = useMemo(() => buildFormulaDrawLandingAnalysis({
    periods,
    action,
    targetType,
    config,
    completedLimit: 10,
    matrixLimit: 10,
  }), [action, config, periods, targetType]);
  const group = groups.find((candidate) => candidate.action === action && candidate.targetType === targetType);
  const selectedSeries = model.series.find((item) => item.targetKey === selectedTargetKey) ?? model.series[0];
  const effectiveTargetKey = selectedSeries?.targetKey ?? selectedTargetKey;
  const selectedItem = group?.items.find((item) => item.targetKey === effectiveTargetKey) ?? group?.items[0];
  const visibleSeries = selectRankSeries(model, effectiveTargetKey, 6);
  const selectedValues = selectedSeries?.values ?? [];
  const unitLabel = action === "exclude" ? "被排除次数" : "被支持次数";
  const title = `${formulaSummaryTargetLabel(targetType)} · ${unitLabel}`;
  const selectedTotal = selectedSeries?.total ?? 0;
  const selectedShare = selectedItem && group?.totalCount ? selectedItem.count / group.totalCount * 100 : 0;
  const activePeriods = selectedValues.filter((value) => value > 0).length;
  const focusedPeriodIndex = periods.findIndex((period) => period.calculationIssue === focusedLandingIssue);
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
  const selectedContributions = periods.flatMap((period) => period.contributions).filter((contribution) => (
    contribution.action === action
    && contribution.targetType === targetType
    && (focusedLandingIssue === "all" || contribution.calculationIssue === focusedLandingIssue)
    && contribution.targets.some((target) => formulaTargetKey(target) === effectiveTargetKey)
  ));
  const uniqueRuleCount = new Set(selectedContributions.map((contribution) => contribution.ruleId)).size;
  const paretoRows = buildFormulaParetoRows(selectedContributions, 10);
  const insight = useMemo(
    () => buildFormulaInsight(model, effectiveTargetKey),
    [effectiveTargetKey, model],
  );

  function focusLandingRecord(record: FormulaDrawLandingRecord) {
    onSelectTarget(record.actualTargetKey);
    setFocusedLandingIssue(record.calculationIssue);
  }

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
              {focusedLandingIssue !== "all" && (
                <div className="rq-formula-viz__active-filter">
                  <span>已聚焦计算期</span><strong>{focusedLandingIssue}</strong>
                  <button type="button" onClick={() => setFocusedLandingIssue("all")}>清除期次筛选</button>
                </div>
              )}
            </header>
            <div className="rq-formula-viz__insight">
              <span>自动洞察</span>
              <strong>{insight}</strong>
              <p>基于当前{periods.length}个计算期、完整结果集合与公式贡献实时生成</p>
            </div>
            <div className="rq-formula-viz__kpis">
              <article className="is-primary"><span>当前结果累计</span><strong>{displayedSelectedTotal}<small>次</small></strong><p>{selectedSeries?.label ?? "-"}在当前筛选的精确次数</p></article>
              <article><span>结果贡献占比</span><strong>{displayedSelectedShare.toFixed(1)}<small>%</small></strong><p>占{group?.label ?? "当前类型"}当前筛选贡献</p></article>
              <article><span>活跃计算期</span><strong>{displayedActivePeriods}<small>/{displayedPeriodCount}</small></strong><p>至少有一条公式产生该结果</p></article>
              <article><span>贡献公式数</span><strong>{uniqueRuleCount}<small>条</small></strong><p>{focusedLandingIssue === "all" ? "已自动去重" : `${focusedLandingIssue}期筛选结果`}</p></article>
            </div>
          </section>

          <section className="rq-formula-viz__trend-panel" aria-labelledby="formula-trend-title">
            <header>
              <div><span>{selectedSeries?.label ?? "-"} · 领先值 · 中位数</span><h3 id="formula-trend-title">相对趋势</h3></div>
              <ChartSpline className="h-5 w-5" />
            </header>
            {selectedSeries ? (
              <FormulaComparisonTrend
                model={model}
                selected={selectedSeries}
                focusedIssue={focusedLandingIssue}
                onFocusPeriod={(issue) => setFocusedLandingIssue((current) => current === issue ? "all" : issue)}
              />
            ) : <p className="rq-formula-viz__empty">暂无可视化数据</p>}
            <div className="rq-formula-viz__trend-summary">
              <span>累计<strong>{selectedTotal}</strong>次</span>
              <span>单期最高<strong>{Math.max(0, ...selectedValues)}</strong>次</span>
              <span>统计单位<strong>公式条数</strong></span>
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

          <section className="rq-formula-viz__trajectory-panel" aria-labelledby="formula-trajectory-title">
            <header><div><span>动态名次 · 第 1 位在上</span><h3 id="formula-trajectory-title">十期排名轨迹</h3></div><p>所选结果高亮，首尾直接标注</p></header>
            <FormulaRankTrajectory
              model={model}
              series={visibleSeries}
              selectedTargetKey={effectiveTargetKey}
              onSelectTarget={onSelectTarget}
            />
          </section>

          <section className="rq-formula-viz__pareto-panel" aria-labelledby="formula-pareto-title">
            <header><div><span>{focusedLandingIssue === "all" ? "完整范围" : `${focusedLandingIssue} 计算期`} · 贡献次数 + 累计占比</span><h3 id="formula-pareto-title">公式贡献帕累托</h3></div><p>80% 参考线识别主要贡献公式</p></header>
            <FormulaParetoChart rows={paretoRows} />
          </section>

          <section className="rq-formula-viz__landing-panel" aria-labelledby="formula-landing-title">
            <header>
              <div><span>实际结果 · 次数 · 当期位置</span><h3 id="formula-landing-title">近十期开奖落点趋势</h3></div>
              <Badge tone={action === "exclude" ? "rose" : "cyan"}>{landing.records.length}期已验证{landing.pendingPeriod ? " · 1期待开奖" : ""}</Badge>
            </header>
            {landing.warningCount > 0 && <p role="status">{landing.warningCount}期开奖数据暂时无法标准化，已从落点分析中排除。</p>}
            <div className="rq-formula-viz__landing-insight"><strong>{landing.insight}</strong></div>
            <div className="rq-formula-viz__landing-kpis">
              <article><span>实际结果平均次数</span><strong>{landing.kpis.averageCount}<small>次</small></strong></article>
              <article><span>落在前三期数</span><strong>{landing.kpis.topThreePeriods}<small>期</small></strong></article>
              <article><span>实际结果平均位置</span><strong>{landing.kpis.averageRank}<small>位</small></strong></article>
              <article><span>单期最高次数</span><strong>{landing.kpis.maxCount}<small>次</small></strong></article>
            </div>
            <FormulaDrawLandingChart
              records={landing.records}
              focusedIssue={focusedLandingIssue}
              unitLabel={unitLabel}
              onFocusIssue={setFocusedLandingIssue}
            />
            <div className="rq-formula-viz__landing-records">
              <header><div><span>逐期核验</span><h4>实际开奖落点记录</h4></div></header>
              <div className="rq-formula-viz__landing-records-scroll">
                <table>
                  <thead><tr><th>计算期</th><th>开奖期</th><th>实际特码 / 结果</th><th>次数</th><th>当期位置</th><th>贡献公式</th><th><span className="sr-only">操作</span></th></tr></thead>
                  <tbody>
                    {landing.records.map((record) => (
                      <tr key={record.calculationIssue} data-landing-record={record.calculationIssue}>
                        <td data-label="计算期">{record.calculationIssue}</td>
                        <td data-label="开奖期">{record.targetIssue}</td>
                        <td data-label="实际特码 / 结果"><strong>{String(record.specialNumber).padStart(2, "0")}</strong><span>{record.actualLabel}</span></td>
                        <td data-label="次数">{record.count}次</td>
                        <td data-label="当期位置">{record.rankLabel}</td>
                        <td data-label="贡献公式">{new Set(record.contributions.map((item) => item.ruleId)).size}条</td>
                        <td><button type="button" onClick={() => focusLandingRecord(record)}>查看</button></td>
                      </tr>
                    ))}
                    {landing.pendingPeriod && <tr className="rq-formula-viz__landing-pending"><td colSpan={7}>下期待开奖 · 待验证</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="rq-formula-viz__matrix-panel" aria-labelledby="formula-matrix-title">
            <header>
              <div><span>期次 × 全部结果 · 点击交叉筛选</span><h3 id="formula-matrix-title">{periods.length > 1 ? "期次分布矩阵" : "本期结果对比"}</h3></div>
              <div className="rq-formula-viz__heat-legend" aria-label={`统一色阶：最低0，最高${model.globalMax}`}>
                <span>统一色阶</span><small>0</small><i aria-hidden="true" /><small>{model.globalMax}</small>
              </div>
            </header>
            <FormulaCompleteMatrix
              analysis={landing}
              targetType={targetType}
              selectedTargetKey={effectiveTargetKey}
              focusedIssue={focusedLandingIssue}
              onSelectTarget={onSelectTarget}
              onFocusIssue={setFocusedLandingIssue}
            />
          </section>

          <section className="rq-formula-viz__evidence-panel" aria-labelledby="formula-evidence-title">
            <header><div><span>{selectedSeries?.label ?? "-"} · {focusedLandingIssue === "all" ? "完整范围" : `${focusedLandingIssue} 计算期`} · 可追溯来源</span><h3 id="formula-evidence-title">贡献公式明细</h3></div><Badge tone="slate">{selectedContributions.length} 条记录</Badge></header>
            <div className="rq-formula-viz__evidence-list">
              {selectedContributions.map((contribution) => {
                const affected = affectedLabel(contribution);
                return (
                  <details key={contribution.id} className="rq-formula-viz__evidence-row">
                    <summary>
                      <span><ListChecks className="h-4 w-4" /></span>
                      <div><strong>{contribution.ruleName}</strong><small>{contribution.calculationIssue} 计算 · {contribution.targetLabel} 对应</small></div>
                      <span className="rq-formula-viz__target-chips" aria-label={`对应结果：${contribution.targets.map(displayTarget).join("、")}`}>
                        {contribution.targets.map((target) => <i key={keyForTarget(target)}>{displayTarget(target)}</i>)}
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </summary>
                    <div className="rq-formula-viz__evidence-detail">
                      <div className="rq-formula-viz__evidence-meta">
                        <p><span>公式</span><code>{contribution.formula}</code></p>
                        <p><span>表达式</span><code>{contribution.expression}</code></p>
                        {affected && <p><span>影响号码</span><b>{affected}</b></p>}
                      </div>
                      {contribution.process.length > 0 && (
                        <div className="rq-formula-viz__process">
                          <span>计算过程</span>
                          <ol>{contribution.process.map((line, index) => <li key={`${contribution.id}:line:${index}`}>{line}</li>)}</ol>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
              {selectedContributions.length === 0 && <p className="rq-formula-viz__empty">当前筛选暂无可追溯贡献记录</p>}
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}
