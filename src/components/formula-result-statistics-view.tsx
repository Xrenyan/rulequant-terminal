"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarRange,
  ChevronRight,
  CircleAlert,
  Layers3,
  ListChecks,
  ChartSpline,
} from "lucide-react";
import {
  buildFormulaSummaryGroups,
  buildFormulaSummaryReport,
  formulaSummaryTargetLabel,
  type FormulaSummaryAction,
  type FormulaSummaryContribution,
  type FormulaSummaryReport,
  type FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type FormulaSummaryWorkerResponse = { ok: true; report: FormulaSummaryReport } | { ok: false; error: string };
type FormulaSummaryCacheEntry = { rules: RuleRecord[]; config: RuleQuantConfig; report: FormulaSummaryReport };
type FormulaSummaryAsyncState = FormulaSummaryCacheEntry & { draws: DrawRecord[]; error?: string };

const formulaSummaryReportCache = new WeakMap<DrawRecord[], FormulaSummaryCacheEntry>();
const FORMULA_SUMMARY_PREPARED_PERIODS = 11;
const FORMULA_SUMMARY_VISIBLE_PERIODS = 10;
const EMPTY_FORMULA_SUMMARY_REPORT: FormulaSummaryReport = {
  periods: [],
  enabledRuleCount: 0,
  formulaCount: 0,
  ignoredRuleCount: 0,
  contributionCount: 0,
  skippedCount: 0,
};

function cachedFormulaSummary(draws: DrawRecord[], rules: RuleRecord[], config: RuleQuantConfig) {
  const cached = formulaSummaryReportCache.get(draws);
  return cached?.rules === rules && cached.config === config ? cached.report : undefined;
}

function FormulaSummaryLoading({ error }: { error?: string }) {
  return (
    <div className="rq-formula-stats-report-loading" role="status" aria-busy={!error}>
      <section className="rq-formula-stats-report-loading__hero">
        <span><BarChart3 className="h-5 w-5" /></span>
        <div><h2>公式结果统计</h2><p>{error || "正在整理完整统计、精确次数与公式来源…"}</p></div>
      </section>
      <section className="rq-formula-stats-report-loading__status">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</section>
      <section className="rq-formula-stats-report-loading__workspace">
        <div>{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>
        <div>{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
      </section>
      <small>{error ? "刷新页面后会自动重新计算。" : "系统会自动完成计算，页面交互不会被阻塞。"}</small>
    </div>
  );
}

export type FormulaResultStatisticsViewProps = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  config: RuleQuantConfig;
};

type RangeMode = "latest" | "ten";

const rangeOptions: Array<{ value: RangeMode; label: string }> = [
  { value: "latest", label: "最新输出" },
  { value: "ten", label: "最近十期" },
];

const actionOptions: Array<{ value: FormulaSummaryAction; label: string; description: string }> = [
  { value: "exclude", label: "排除统计", description: "被排除次数" },
  { value: "include", label: "支持统计", description: "被支持次数" },
];

function contributionOutput(contribution: FormulaSummaryContribution): string {
  return contribution.targets.map(String).join("、") || "无输出";
}

function affectedOutput(contribution: FormulaSummaryContribution): string {
  if (!contribution.affectedTargets?.length) return "";
  return contribution.affectedTargets
    .map((target) => typeof target === "number" ? String(target).padStart(2, "0") : String(target))
    .join("、");
}

function FormulaEvidenceRow({ contribution }: { contribution: FormulaSummaryContribution }) {
  const affected = affectedOutput(contribution);
  return (
    <details className="rq-formula-stats__evidence-row">
      <summary>
        <span className="rq-formula-stats__evidence-icon"><ListChecks className="h-4 w-4" /></span>
        <span className="min-w-0">
          <strong>{contribution.ruleName}</strong>
          <small>{contribution.calculationIssue} 计算 · {contribution.targetLabel} 对应</small>
        </span>
        <Badge tone={contribution.action === "exclude" ? "rose" : "cyan"}>{contributionOutput(contribution)}</Badge>
        <ChevronRight className="rq-formula-stats__evidence-chevron h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="rq-formula-stats__evidence-body">
        <p><span>公式</span><code>{contribution.formula}</code></p>
        <p><span>表达式</span><code>{contribution.expression}</code></p>
        <p><span>统计输出</span><b>{contributionOutput(contribution)}</b></p>
        {affected && <p><span>影响号码</span><b>{affected}</b></p>}
        <div>
          <span>计算过程</span>
          <ol>{contribution.process.map((line, index) => <li key={`${contribution.id}-${index}`}>{line}</li>)}</ol>
        </div>
      </div>
    </details>
  );
}

export function FormulaResultStatisticsView({ draws, rules, config }: FormulaResultStatisticsViewProps) {
  const [rangeMode, setRangeMode] = useState<RangeMode>("latest");
  const [action, setAction] = useState<FormulaSummaryAction>("exclude");
  const [requestedTargetType, setRequestedTargetType] = useState<FormulaSummaryTargetType | "">("");
  const [requestedTarget, setRequestedTarget] = useState("");

  const workerAvailable = typeof Worker !== "undefined";
  const synchronousReport = useMemo(
    () => workerAvailable ? undefined : buildFormulaSummaryReport({ draws, rules, config, maxPeriods: FORMULA_SUMMARY_PREPARED_PERIODS }),
    [workerAvailable, draws, rules, config],
  );
  const [asyncState, setAsyncState] = useState<FormulaSummaryAsyncState>(() => ({
    draws,
    rules,
    config,
    report: cachedFormulaSummary(draws, rules, config) ?? EMPTY_FORMULA_SUMMARY_REPORT,
  }));

  useEffect(() => {
    if (!workerAvailable) return;

    const cached = cachedFormulaSummary(draws, rules, config);
    if (cached) {
      queueMicrotask(() => setAsyncState({ draws, rules, config, report: cached }));
      return;
    }

    let disposed = false;
    let settled = false;
    let worker: Worker | undefined;
    const settle = (nextReport: FormulaSummaryReport, error?: string) => {
      if (disposed || settled) return;
      settled = true;
      startTransition(() => setAsyncState({ draws, rules, config, report: nextReport, error }));
      worker?.terminate();
    };
    const recoverFromWorkerFailure = (error: unknown) => {
      if (disposed || settled) return;
      try {
        const fallbackReport = buildFormulaSummaryReport({
          draws,
          rules,
          config,
          maxPeriods: FORMULA_SUMMARY_PREPARED_PERIODS,
        });
        formulaSummaryReportCache.set(draws, { rules, config, report: fallbackReport });
        settle(fallbackReport);
      } catch (fallbackError) {
        const message = fallbackError instanceof Error
          ? fallbackError.message
          : error instanceof Error
            ? error.message
            : "统计暂时无法完成";
        settle(EMPTY_FORMULA_SUMMARY_REPORT, message);
      }
    };
    queueMicrotask(() => {
      if (!disposed && !settled) setAsyncState({ draws, rules, config, report: EMPTY_FORMULA_SUMMARY_REPORT });
    });
    try {
      worker = new Worker(new URL("../workers/formula-summary.worker.ts", import.meta.url));
      worker.onmessage = (event: MessageEvent<FormulaSummaryWorkerResponse>) => {
        if (disposed || settled) return;
        if (!event.data.ok) {
          recoverFromWorkerFailure(event.data.error);
          return;
        }
        const nextReport = event.data.report;
        formulaSummaryReportCache.set(draws, { rules, config, report: nextReport });
        settle(nextReport);
      };
      worker.onerror = () => recoverFromWorkerFailure(new Error("统计暂时无法完成"));
      worker.onmessageerror = () => recoverFromWorkerFailure(new Error("统计结果暂时无法读取"));
      worker.postMessage({ draws, rules, config, maxPeriods: FORMULA_SUMMARY_PREPARED_PERIODS });
    } catch (error) {
      recoverFromWorkerFailure(error);
    }
    return () => {
      disposed = true;
      if (!settled) worker?.terminate();
    };
  }, [workerAvailable, draws, rules, config]);

  const asyncReport = asyncState.draws === draws && asyncState.rules === rules && asyncState.config === config && asyncState.report.periods.length
    ? asyncState.report
    : undefined;
  const report = synchronousReport ?? asyncReport ?? EMPTY_FORMULA_SUMMARY_REPORT;
  const reportError = asyncState.draws === draws && asyncState.rules === rules && asyncState.config === config ? asyncState.error : undefined;
  const visiblePeriods = useMemo(
    () => rangeMode === "latest"
      ? report.periods.slice(-1)
      : report.periods.slice(-FORMULA_SUMMARY_VISIBLE_PERIODS),
    [rangeMode, report.periods],
  );
  const groups = useMemo(() => buildFormulaSummaryGroups(visiblePeriods), [visiblePeriods]);
  const actionGroups = groups.filter((group) => group.action === action);
  const activeTargetType = actionGroups.some((group) => group.targetType === requestedTargetType)
    ? requestedTargetType
    : (actionGroups[0]?.targetType ?? "");
  const activeGroup = actionGroups.find((group) => group.targetType === activeTargetType);
  const activeTarget = requestedTarget || activeGroup?.items[0]?.targetKey || "";
  const activeItem = activeGroup?.items.find((item) => item.targetKey === activeTarget);
  const maxCount = activeGroup?.items[0]?.count ?? 1;
  const latest = report.latestPeriod;
  const actionCopy = actionOptions.find((option) => option.value === action)!;
  const analysisHref = `/formula-result-statistics/analysis?${new URLSearchParams({
    tab: "overview",
    range: "10",
    action,
    type: activeTargetType || "zodiac",
  })}`;

  const changeRange = (nextRange: RangeMode) => {
    startTransition(() => setRangeMode(nextRange));
  };

  const changeAction = (nextAction: FormulaSummaryAction) => {
    startTransition(() => {
      setAction(nextAction);
      setRequestedTargetType("");
      setRequestedTarget("");
    });
  };

  if (!synchronousReport && !asyncReport) return <FormulaSummaryLoading error={reportError} />;

  return (
    <div className="rq-formula-stats">
      <Panel className="rq-formula-stats__command rq-task-surface p-4 sm:p-5" aria-labelledby="formula-statistics-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="formula-statistics-title">公式结果统计</h2>
            <p className="mt-1 text-sm text-slate-500">按最新一期或最近十期，统计每条启用公式产生的排除与支持次数。</p>
          </div>
          <Link href={analysisHref} className="rq-button rq-button--primary inline-flex h-10 min-h-10 w-full items-center justify-center gap-2 border px-4 text-sm font-medium sm:w-auto">
            <ChartSpline className="h-4 w-4" />进入分析驾驶舱
          </Link>
        </div>
        <div className="rq-formula-stats__sync-note mt-4">
          <Badge tone="green">实时统计</Badge>
          <span><b>随开奖自动更新</b><small>直接读取现有开奖与公式，不保存过期统计副本</small></span>
        </div>
      </Panel>

      <div className="rq-workspace-tabs rq-formula-stats__status" aria-label="统计运行概况">
        <div className="rq-workspace-tab rq-workspace-tab--active"><CalendarRange className="h-4 w-4" /><span>最新计算期</span><strong>{latest?.calculationIssue ?? "-"}</strong></div>
        <div className="rq-workspace-tab"><ChevronRight className="h-4 w-4" /><span>对应期</span><strong>{latest?.targetLabel ?? "-"}</strong></div>
        <div className="rq-workspace-tab"><Layers3 className="h-4 w-4" /><span>参与统计公式</span><strong>{report.formulaCount} 条</strong></div>
        <div className="rq-workspace-tab"><BarChart3 className="h-4 w-4" /><span>当前范围</span><strong>{visiblePeriods.length} 个计算期</strong></div>
        <div className="rq-workspace-tab"><CircleAlert className="h-4 w-4" /><span>跳过异常</span><strong>{visiblePeriods.reduce((sum, period) => sum + period.skippedRules.length, 0)} 条</strong></div>
      </div>

      <Panel className="rq-formula-stats__workspace">
        <div className="rq-formula-stats__toolbar">
          <div className="rq-formula-stats__segmented rq-segmented-control" aria-label="统计时间范围">
            {rangeOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={rangeMode === option.value ? "primary" : "ghost"}
                aria-pressed={rangeMode === option.value}
                onClick={() => changeRange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="rq-formula-stats__segmented rq-segmented-control" aria-label="统计动作">
            {actionOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={action === option.value ? "primary" : "ghost"}
                aria-pressed={action === option.value}
                onClick={() => changeAction(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {actionGroups.length ? (
          <>
            <div className="rq-formula-stats__type-scroll rq-segmented-control" role="tablist" aria-label="公式结果类型">
              {actionGroups.map((group) => (
                <Button
                  key={group.targetType}
                  type="button"
                  size="sm"
                  variant={activeTargetType === group.targetType ? "primary" : "ghost"}
                  role="tab"
                  aria-selected={activeTargetType === group.targetType}
                  onClick={() => startTransition(() => {
                    setRequestedTargetType(group.targetType);
                    setRequestedTarget("");
                  })}
                >
                  <span>{formulaSummaryTargetLabel(group.targetType)}</span>
                  <small>{group.items.length}</small>
                </Button>
              ))}
            </div>

            <div className="rq-formula-stats__ranking-head">
              <div>
                <span>{activeGroup?.label}排行</span>
                <strong>{actionCopy.description}</strong>
              </div>
              <p>每条公式对每个唯一结果只计 1 次</p>
            </div>

            <div className="rq-formula-stats__ranking" aria-label={`${activeGroup?.label ?? "结果"}${actionCopy.description}`}>
              {activeGroup?.items.map((item, index) => (
                <button
                  key={item.targetKey}
                  type="button"
                  aria-pressed={activeTarget === item.targetKey}
                  aria-label={`查看${item.label}的公式明细`}
                  className={cn("rq-formula-stats__rank-row", activeTarget === item.targetKey && "is-active")}
                  onClick={() => setRequestedTarget(item.targetKey)}
                >
                  <span className="rq-formula-stats__rank-label"><small>{String(index + 1).padStart(2, "0")}</small><b>{item.label}</b></span>
                  <span className="rq-formula-stats__bar-track" aria-hidden="true">
                    <span
                      className={cn("rq-formula-stats__bar", action === "exclude" ? "is-exclude" : "is-include")}
                      style={{ width: `${Math.max(5, item.count / maxCount * 100)}%` }}
                    />
                  </span>
                  <strong className="rq-formula-stats__rank-value">{item.count}<small>次</small></strong>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="rq-formula-stats__empty">
            <CircleAlert className="h-6 w-6" />
            <strong>当前范围暂无{action === "exclude" ? "排除" : "支持"}结果</strong>
            <p>同步开奖或启用对应类型的公式后，这里会自动显示完整统计。</p>
          </div>
        )}
      </Panel>

      <Panel className="rq-formula-stats__evidence">
        <header>
          <div>
            <span>公式来源</span>
            <h3>{activeItem ? `${activeItem.label} · ${actionCopy.description}` : "等待选择结果"}</h3>
          </div>
          <Badge tone={action === "exclude" ? "rose" : "cyan"}>{activeItem?.contributions.length ?? 0} 条公式记录</Badge>
        </header>
        {activeItem?.contributions.length ? (
          <div className="rq-formula-stats__evidence-list">
            {activeItem.contributions.map((contribution) => (
              <FormulaEvidenceRow key={contribution.id} contribution={contribution} />
            ))}
          </div>
        ) : (
          <div className="rq-formula-stats__empty is-compact"><p>选择上方任一结果后，可查看贡献它的全部公式和计算过程。</p></div>
        )}
      </Panel>
    </div>
  );
}
