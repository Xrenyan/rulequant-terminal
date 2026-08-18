"use client";

import { useMemo, useState } from "react";
import { CircleAlert, Eraser, ListChecks, Search, Target } from "lucide-react";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";
import { formulaTargetKey, type FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";
import type { FormulaSummaryContribution } from "@/lib/formula-summary/formula-summary";
import { FormulaCompleteMatrix } from "@/components/formula-complete-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

function displayTarget(target: number | string): string {
  return typeof target === "number" ? String(target).padStart(2, "0") : String(target);
}

export function FormulaEvidenceWorkspace({ report, initialRecord, initialIssue }: { report: FormulaAnalysisReport; initialRecord?: FormulaDrawLandingRecord; initialIssue?: string }) {
  const defaultTarget = initialRecord?.actualTargetKey ?? report.landing.domain[0]?.targetKey ?? "";
  const [selectedTargetKey, setSelectedTargetKey] = useState(defaultTarget);
  const [focusedIssue, setFocusedIssue] = useState(initialRecord?.calculationIssue ?? initialIssue ?? "all");
  const [query, setQuery] = useState("");
  const [selectedContributionId, setSelectedContributionId] = useState("");

  const target = report.landing.domain.find((item) => item.targetKey === selectedTargetKey);
  const allContributions = useMemo(() => report.summary.periods.flatMap((period) => period.contributions).filter((contribution) => (
    contribution.action === report.action
    && contribution.targetType === report.targetType
    && (focusedIssue === "all" || contribution.calculationIssue === focusedIssue)
    && contribution.targets.some((item) => formulaTargetKey(item) === selectedTargetKey)
  )), [focusedIssue, report.action, report.summary.periods, report.targetType, selectedTargetKey]);
  const visibleContributions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    return allContributions.filter((contribution) => !normalized || `${contribution.ruleName} ${contribution.formula} ${contribution.calculationIssue}`.toLocaleLowerCase("zh-CN").includes(normalized)).slice(0, 40);
  }, [allContributions, query]);
  const selectedContribution = visibleContributions.find((item) => item.id === selectedContributionId);
  const focusActual = (record: FormulaDrawLandingRecord) => {
    setSelectedTargetKey(record.actualTargetKey);
    setFocusedIssue(record.calculationIssue);
    setSelectedContributionId("");
  };
  const changeTarget = (targetKey: string) => {
    setSelectedTargetKey(targetKey);
    setSelectedContributionId("");
  };
  const changeIssue = (issue: string) => {
    setFocusedIssue(issue);
    setSelectedContributionId("");
  };
  return (
    <div className="rq-evidence-workspace">
      <Panel className="rq-evidence-workspace__head">
        <div><Badge tone="cyan">逐期核验</Badge><h2>期次 × 全部结果</h2><p>矩阵中的数字是该结果在当期被多少条公式排除或支持。靶心标记实际开奖；点击后会同时定位期次和实际结果。</p></div>
        <div className="rq-evidence-workspace__focus"><small>当前定位</small><strong>{focusedIssue === "all" ? "全部计算期" : `${focusedIssue} 计算期`} · {target?.label ?? "未选结果"}</strong><span>{allContributions.length} 条贡献记录</span></div>
      </Panel>

      <section className="rq-evidence-toolbar" data-evidence-toolbar aria-label="明细核验筛选">
        <label><span>计算期</span><Select aria-label="选择计算期" value={focusedIssue} onChange={(event) => changeIssue(event.target.value)}><option value="all">全部计算期</option>{report.summary.periods.map((period) => <option key={period.calculationIssue} value={period.calculationIssue}>{period.calculationIssue} → {period.isPending ? "待开奖" : period.targetLabel}</option>)}</Select></label>
        <label><span>结果</span><Select aria-label="选择结果" value={selectedTargetKey} onChange={(event) => changeTarget(event.target.value)}>{report.landing.domain.map((item) => <option key={item.targetKey} value={item.targetKey}>{item.label}</option>)}</Select></label>
        <label><span><Search className="h-4 w-4" />搜索贡献公式</span><Input aria-label="搜索贡献公式" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称、公式或期次" /></label>
        <Button size="sm" variant="ghost" onClick={() => { setFocusedIssue("all"); setQuery(""); setSelectedContributionId(""); }}><Eraser className="h-4 w-4" />清除定位</Button>
      </section>

      <Panel className="rq-evidence-matrix-panel">
        <header><div><span>完整结果域 · 0 次也保留</span><h2>分布矩阵</h2></div><div className="rq-evidence-legend"><span><Target className="h-4 w-4" />实际开奖</span><span><i />次数越高颜色越深</span></div></header>
        <FormulaCompleteMatrix analysis={report.landing} targetType={report.targetType} selectedTargetKey={selectedTargetKey} focusedIssue={focusedIssue} onFocusActualRecord={focusActual} onSelectTarget={changeTarget} onFocusIssue={changeIssue} />
      </Panel>

      <Panel className="rq-evidence-list-panel">
        <header><div><span>{target?.label ?? "-"} · {focusedIssue === "all" ? `最近${report.window}期` : `${focusedIssue}计算期`}</span><h2>贡献公式明细</h2><p>先选中一条记录，下方只展示这一条的计算依据，避免每行重复按钮。</p></div><Badge tone="slate">{allContributions.length} 条</Badge></header>
        {allContributions.length === 0 ? <div className="rq-evidence-empty"><CircleAlert className="h-5 w-5" /><strong>当前选择是 0 次，没有贡献公式</strong><p>这是正常结果，不会自动换成其他结果，也不会编造证据。</p></div> : (
          <>
            <div className="rq-evidence-list" role="listbox" aria-label="贡献公式记录">
              {visibleContributions.map((contribution) => <button key={contribution.id} type="button" role="option" data-evidence-row={contribution.id} aria-selected={selectedContributionId === contribution.id} className={cn(selectedContributionId === contribution.id && "is-selected")} onClick={() => setSelectedContributionId(contribution.id)}><span><ListChecks className="h-4 w-4" /><b>{contribution.ruleName}</b><small>{contribution.calculationIssue} 计算 → {contribution.targetLabel}</small></span><span className="rq-evidence-targets">{contribution.targets.map((item) => <i key={formulaTargetKey(item)}>{displayTarget(item)}</i>)}</span></button>)}
            </div>
            {visibleContributions.length < allContributions.length && <p className="rq-evidence-window-note">为保持页面流畅，当前先显示前40条；搜索仍覆盖全部 {allContributions.length} 条记录。</p>}
          </>
        )}
        {selectedContribution && <EvidenceDetail contribution={selectedContribution} />}
      </Panel>
    </div>
  );
}

function EvidenceDetail({ contribution }: { contribution: FormulaSummaryContribution }) {
  return <article className="rq-evidence-detail" data-evidence-detail={contribution.id}>
    <header><div><span>所选记录</span><h3>{contribution.ruleName}</h3></div><Badge tone={contribution.action === "exclude" ? "rose" : "cyan"}>{contribution.action === "exclude" ? "排除公式" : "支持公式"}</Badge></header>
    <div><p><span>原公式</span><code>{contribution.formula}</code></p><p><span>代入表达式</span><code>{contribution.expression}</code></p><p><span>输出结果</span><b>{contribution.targets.map(displayTarget).join("、")}</b></p></div>
    <section><span>计算过程</span>{contribution.process.length ? <ol>{contribution.process.map((line, index) => <li key={`${contribution.id}:${index}`}>{line}</li>)}</ol> : <p>该记录没有额外过程文本。</p>}</section>
  </article>;
}
