"use client";

import { startTransition, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  ChevronRight,
  CircleAlert,
  Layers3,
  ListChecks,
  Sparkles,
} from "lucide-react";
import {
  buildFormulaSummaryGroups,
  buildFormulaSummaryReport,
  formulaSummaryTargetLabel,
  type FormulaSummaryAction,
  type FormulaSummaryContribution,
  type FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

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

  const report = useMemo(
    () => buildFormulaSummaryReport({ draws, rules, config, maxPeriods: 10 }),
    [draws, rules, config],
  );
  const visiblePeriods = useMemo(
    () => rangeMode === "latest" ? report.periods.slice(-1) : report.periods,
    [rangeMode, report.periods],
  );
  const groups = useMemo(() => buildFormulaSummaryGroups(visiblePeriods), [visiblePeriods]);
  const actionGroups = groups.filter((group) => group.action === action);
  const activeTargetType = actionGroups.some((group) => group.targetType === requestedTargetType)
    ? requestedTargetType
    : (actionGroups[0]?.targetType ?? "");
  const activeGroup = actionGroups.find((group) => group.targetType === activeTargetType);
  const activeTarget = activeGroup?.items.some((item) => item.targetKey === requestedTarget)
    ? requestedTarget
    : (activeGroup?.items[0]?.targetKey ?? "");
  const activeItem = activeGroup?.items.find((item) => item.targetKey === activeTarget);
  const maxCount = activeGroup?.items[0]?.count ?? 1;
  const latest = report.latestPeriod;
  const actionCopy = actionOptions.find((option) => option.value === action)!;

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

  return (
    <div className="rq-formula-stats">
      <section className="rq-formula-stats__hero" aria-labelledby="formula-statistics-title">
        <div>
          <div className="rq-formula-stats__hero-icon"><BarChart3 className="h-5 w-5" /></div>
          <h2 id="formula-statistics-title">公式结果统计</h2>
          <p>按最新一期或最近十期，统计每条启用公式产生的排除与支持次数。</p>
        </div>
        <div className="rq-formula-stats__freshness">
          <Sparkles className="h-4 w-4" />
          <span><b>随开奖自动更新</b><small>不保存过期统计副本</small></span>
        </div>
      </section>

      <Panel className="rq-formula-stats__status" aria-label="统计运行概况">
        <div><CalendarRange className="h-4 w-4" /><span>最新计算期</span><strong>{latest?.calculationIssue ?? "-"}</strong></div>
        <div><ChevronRight className="h-4 w-4" /><span>对应期</span><strong>{latest?.targetLabel ?? "-"}</strong></div>
        <div><Layers3 className="h-4 w-4" /><span>参与统计公式</span><strong>{report.formulaCount} 条</strong></div>
        <div><BarChart3 className="h-4 w-4" /><span>当前范围</span><strong>{visiblePeriods.length} 个计算期</strong></div>
        <div><CircleAlert className="h-4 w-4" /><span>跳过异常</span><strong>{visiblePeriods.reduce((sum, period) => sum + period.skippedRules.length, 0)} 条</strong></div>
      </Panel>

      <Panel className="rq-formula-stats__workspace">
        <div className="rq-formula-stats__toolbar">
          <div className="rq-formula-stats__segmented" aria-label="统计时间范围">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={rangeMode === option.value}
                className={cn(rangeMode === option.value && "is-active")}
                onClick={() => changeRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="rq-formula-stats__segmented" aria-label="统计动作">
            {actionOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={action === option.value}
                className={cn(action === option.value && "is-active", option.value === "exclude" ? "is-exclude" : "is-include")}
                onClick={() => changeAction(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {actionGroups.length ? (
          <>
            <div className="rq-formula-stats__type-scroll" role="tablist" aria-label="公式结果类型">
              {actionGroups.map((group) => (
                <button
                  key={group.targetType}
                  type="button"
                  role="tab"
                  aria-selected={activeTargetType === group.targetType}
                  className={cn(activeTargetType === group.targetType && "is-active")}
                  onClick={() => startTransition(() => {
                    setRequestedTargetType(group.targetType);
                    setRequestedTarget("");
                  })}
                >
                  <span>{formulaSummaryTargetLabel(group.targetType)}</span>
                  <small>{group.items.length}</small>
                </button>
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
