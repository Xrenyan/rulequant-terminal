"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, Braces, CircleAlert, CopyCheck, Search, ShieldCheck } from "lucide-react";
import type {
  FormulaAnalysisReport,
  FormulaHealthRow,
  FormulaHealthStatus,
  FormulaPairDiagnostic,
} from "@/lib/formula-analysis/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { ExpandableVisualization } from "@/components/ui/expandable-visualization";

const STATUS_LABELS: Record<FormulaHealthStatus, { label: string; explanation: string; tone: "green" | "yellow" | "rose" | "slate" }> = {
  normal: { label: "状态正常", explanation: "样本足够，近期未出现明显连续未通过或大幅波动。", tone: "green" },
  "sample-low": { label: "样本不足", explanation: "少于10个可验证期，只展示事实，不宜解读为稳定表现。", tone: "yellow" },
  "consecutive-failure": { label: "连续未通过", explanation: "最近至少连续3期未通过，需要先核对公式和数据。", tone: "rose" },
  volatile: { label: "近期波动", explanation: "最近10期和较长窗口相差至少15个百分点。", tone: "yellow" },
  "calculation-error": { label: "计算异常", explanation: "公式在当前数据或配置下无法完成计算。", tone: "rose" },
};
const STATUS_ORDER: FormulaHealthStatus[] = ["normal", "sample-low", "consecutive-failure", "volatile", "calculation-error"];

function metricText(row: FormulaHealthRow, window: 10 | 30 | 50): string {
  const metric = row.windows[window];
  return `${metric.successRate}% · ${metric.successes}/${metric.sampleSize}`;
}

function PairRows({ rows, empty, onOpenIssue }: { rows: FormulaPairDiagnostic[]; empty: string; onOpenIssue: (issue: string) => void }) {
  if (!rows.length) return <p className="rq-health-pairs__empty">{empty}</p>;
  return <div className="rq-health-pairs__list">{rows.map((row) => (
    <article key={`${row.kind}:${row.leftRuleId}:${row.rightRuleId}`} data-pair-row={row.kind}>
      <header><div><strong>{row.leftRuleName}</strong><span>与</span><strong>{row.rightRuleName}</strong></div><Badge tone={row.kind === "duplicate" ? "cyan" : "rose"}>{row.kind === "duplicate" ? "高度重复" : "方向冲突"}</Badge></header>
      <div><span>相似度 <b>{Math.round(row.score * 100)}%</b></span><span>共同样本 {row.commonPeriods} 期</span><span>重合期 {row.overlapPeriods} 期</span><span>完全相同 {row.exactMatchPeriods} 期</span></div>
      <footer><small>证据期次</small>{row.exampleIssues.length ? row.exampleIssues.map((issue) => <button key={issue} type="button" data-pair-issue={issue} onClick={() => onOpenIssue(issue)}>{issue}</button>) : <span>暂无可列举期次</span>}</footer>
    </article>
  ))}</div>;
}

export function FormulaHealthWorkspace({ report, onOpenIssue }: { report: FormulaAnalysisReport; onOpenIssue: (issue: string) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FormulaHealthStatus | "all">("all");
  const [sort, setSort] = useState<"attention" | "rate10" | "failure-streak" | "name">("attention");
  const [pairMode, setPairMode] = useState<"duplicate" | "conflict">("duplicate");
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const statusPriority: Record<FormulaHealthStatus, number> = { "calculation-error": 0, "consecutive-failure": 1, volatile: 2, "sample-low": 3, normal: 4 };
    return report.health.rows.filter((row) => (
      (status === "all" || row.status === status)
      && (!normalized || row.ruleName.toLocaleLowerCase("zh-CN").includes(normalized))
    )).sort((left, right) => {
      if (sort === "rate10") return right.windows[10].successRate - left.windows[10].successRate;
      if (sort === "failure-streak") return right.currentFailureStreak - left.currentFailureStreak;
      if (sort === "name") return left.ruleName.localeCompare(right.ruleName, "zh-CN");
      return statusPriority[left.status] - statusPriority[right.status]
        || right.currentFailureStreak - left.currentFailureStreak;
    });
  }, [query, report.health.rows, sort, status]);
  const healthTotal = report.health.rows.length;
  const healthSummary = STATUS_ORDER.map((key) => `${report.health.counts[key]} 条${STATUS_LABELS[key].label}`).join("，");
  const attentionCount = healthTotal - report.health.counts.normal;
  return (
    <div className="rq-health-workspace">
      <Panel className="rq-health-workspace__head">
        <div><Badge tone="cyan">公式诊断</Badge><h2>先找需要检查的公式，再看重复与冲突</h2><p>“通过”沿用系统现有公式校验：排除公式只有在实际结果没有落入排除集合时才算通过。健康度不是预测分数。</p></div>
        <div className="rq-health-workspace__legend">
          {Object.entries(STATUS_LABELS).map(([key, item]) => <span key={key}><i className={`is-${key}`} />{item.label}<small>{item.explanation}</small></span>)}
        </div>
      </Panel>

      <ExpandableVisualization title="公式健康状态分布"><section className="rq-health-status-overview" aria-label="公式健康状态分布">
        <header className="rq-health-status-overview__summary">
          <div><span>全部公式状态构成</span><strong>{report.health.counts.normal} 条正常<small> · {attentionCount} 条需检查</small></strong></div>
          <div
            className="rq-health-status-overview__band"
            data-health-status-band
            role="img"
            aria-label={`公式健康状态占比：${healthSummary}`}
          >
            {STATUS_ORDER.map((key) => {
              const count = report.health.counts[key];
              const percentage = healthTotal ? count / healthTotal * 100 : 0;
              return <i key={key} className={`is-${key}`} style={{ width: `${percentage}%` }} title={`${STATUS_LABELS[key].label} ${count}条`} />;
            })}
          </div>
          <p>整条代表全部公式；下方按状态列出精确数量和占比，点击即可筛选。</p>
        </header>
        <div className="rq-health-status-overview__rows">
          {STATUS_ORDER.map((key) => {
            const item = STATUS_LABELS[key];
            const count = report.health.counts[key];
            const percentage = healthTotal ? count / healthTotal * 100 : 0;
            return <button
              key={key}
              type="button"
              data-health-status-filter={key}
              data-health-status-share={percentage}
              aria-label={`${item.label}，${count}条，占${percentage.toFixed(1)}%，${item.explanation}`}
              aria-pressed={status === key}
              onClick={() => setStatus((current) => current === key ? "all" : key)}
            ><span><i className={`is-${key}`} /><b>{item.label}</b></span><strong>{count}<small>条 · {percentage.toFixed(1)}%</small></strong><em><i style={{ width: `${percentage}%` }} /></em><p>{item.explanation}</p></button>;
          })}
        </div>
      </section></ExpandableVisualization>

      <section className="rq-health-toolbar" aria-label="公式健康筛选">
        <label><span><Search className="h-4 w-4" />搜索公式</span><Input aria-label="搜索公式" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入公式名称" /></label>
        <label><span><ShieldCheck className="h-4 w-4" />状态筛选</span><Select aria-label="状态筛选" value={status} onChange={(event) => setStatus(event.target.value as FormulaHealthStatus | "all")}><option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</Select></label>
        <label><span><ArrowDownUp className="h-4 w-4" />排序方式</span><Select aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="attention">需留意优先</option><option value="rate10">最近10期通过率</option><option value="failure-streak">连续未通过</option><option value="name">公式名称</option></Select></label>
      </section>

      <Panel className="rq-health-table-panel">
        <header><div><span>公式健康表</span><h2>10 / 30 / 50 期表现</h2></div><Badge tone="slate">显示 {rows.length} / {report.health.rows.length} 条</Badge></header>
        <div className="rq-health-table-scroll">
          <table className="rq-health-table">
            <thead><tr><th scope="col">公式</th><th scope="col">状态</th><th scope="col">最近10期</th><th scope="col">最近30期</th><th scope="col">最近50期</th><th scope="col">当前连续通过</th><th scope="col">当前连续未通过</th><th scope="col">最长连续未通过</th><th scope="col">计算说明</th></tr></thead>
            <tbody>{rows.map((row) => {
              const state = STATUS_LABELS[row.status];
              return <tr key={row.ruleId} data-health-row={row.ruleId}>
                <td data-label="公式"><strong>{row.ruleName}</strong></td>
                <td data-label="状态"><Badge tone={state.tone}>{state.label}</Badge><small>{state.explanation}</small></td>
                <td data-label="最近10期"><b>{metricText(row, 10)}</b>{row.windows[10].sampleSize < 10 && <small>样本不足10期</small>}</td>
                <td data-label="最近30期"><b>{metricText(row, 30)}</b></td>
                <td data-label="最近50期"><b>{metricText(row, 50)}</b></td>
                <td data-label="当前连续通过">{row.currentSuccessStreak} 期</td>
                <td data-label="当前连续未通过">{row.currentFailureStreak} 期</td>
                <td data-label="最长连续未通过">{row.longestFailureStreak} 期</td>
                <td data-label="计算说明"><details><summary>查看异常期次</summary><p><b>最近未通过期次</b>{row.latestFailureIssues.join("、") || "暂无"}</p>{row.error && <p><b>问题说明</b>{row.error}</p>}</details></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </Panel>

      <Panel className="rq-health-pairs">
        <header><div><span>公式关系诊断</span><h2>高度重复与方向冲突</h2><p>只比较相同结果类型；至少共同出现 {report.pairs.minimumCommonPeriods} 期。重复阈值 {Math.round(report.pairs.duplicateThreshold * 100)}%，冲突阈值 {Math.round(report.pairs.conflictThreshold * 100)}%。</p></div><div className="rq-segmented-control"><Button size="sm" variant={pairMode === "duplicate" ? "primary" : "ghost"} aria-pressed={pairMode === "duplicate"} onClick={() => setPairMode("duplicate")}><CopyCheck className="h-4 w-4" />高度重复</Button><Button size="sm" variant={pairMode === "conflict" ? "primary" : "ghost"} aria-pressed={pairMode === "conflict"} onClick={() => setPairMode("conflict")}><AlertTriangle className="h-4 w-4" />方向冲突</Button></div></header>
        <div className="rq-health-pairs__explain"><CircleAlert className="h-4 w-4" /><p>{pairMode === "duplicate" ? "两条公式经常给出高度相似的结果集合，可能重复贡献同一种意见。" : "排除与支持公式经常指向相同结果，需要逐期核对是否逻辑相抵。"}</p></div>
        <PairRows rows={pairMode === "duplicate" ? report.pairs.duplicates : report.pairs.conflicts} empty={pairMode === "duplicate" ? "当前筛选没有达到阈值的高度重复公式。" : "当前筛选没有达到阈值的方向冲突公式。"} onOpenIssue={onOpenIssue} />
      </Panel>
      <p className="rq-health-workspace__note"><Braces className="h-4 w-4" />通过率必须同时看分子/分母和样本期数；不要只看百分比。</p>
    </div>
  );
}
