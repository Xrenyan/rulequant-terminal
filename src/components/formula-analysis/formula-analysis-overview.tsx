"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Clock3, Database, ShieldCheck, Target } from "lucide-react";
import type { FormulaAnalysisReport } from "@/lib/formula-analysis/types";
import type { FormulaDrawLandingRecord } from "@/lib/formula-summary/formula-draw-landing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { FormulaDrawLandingChart } from "@/components/formula-draw-landing-chart";
import { cn } from "@/lib/utils";

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function FormulaAnalysisOverview({
  report,
  onOpenEvidence,
  onOpenLanding,
  onOpenDiagnostics,
}: {
  report: FormulaAnalysisReport;
  onOpenEvidence: (record: FormulaDrawLandingRecord) => void;
  onOpenLanding: () => void;
  onOpenDiagnostics: () => void;
}) {
  const [selectedIssue, setSelectedIssue] = useState("");
  const records = report.landing.records;
  const selected = records.find((record) => record.calculationIssue === selectedIssue);
  const latestRecords = records.slice(-3).reverse();
  const actionWord = report.action === "exclude" ? "被排除" : "被支持";
  const coverageComplete = records.length >= report.window;
  const healthyFormulas = report.health.counts.normal;
  const attentionFormulas = report.health.rows.length - healthyFormulas;
  const dataStale = report.dataHealth.freshness === "stale";

  return (
    <div className="rq-analysis-overview">
      <section className="rq-analysis-overview__kpis" aria-label="本次分析关键指标">
        <article data-analysis-kpi="primary" className="rq-analysis-kpi is-primary">
          <span><Target className="h-5 w-5" />实际落点平均{actionWord}</span>
          <strong>{formatNumber(report.landing.kpis.averageCount)}<small>次 / 期</small></strong>
          <p>指实际开出的结果，在当期全部公式输出中一共出现多少次。</p>
        </article>
        <article data-analysis-kpi="secondary" className="rq-analysis-kpi"><span>落在前三位</span><strong>{report.landing.kpis.topThreePeriods}<small> / {records.length}期</small></strong><p>位置越靠前，代表同一期得到它的公式越多。</p></article>
        <article data-analysis-kpi="secondary" className="rq-analysis-kpi"><span>平均位置</span><strong>{formatNumber(report.landing.kpis.averageRank)}<small>位</small></strong><p>并列采用相同名次，不强行打散。</p></article>
        <article data-analysis-kpi="secondary" className="rq-analysis-kpi"><span>最高{actionWord}</span><strong>{report.landing.kpis.maxCount}<small>次</small></strong><p>最近范围内单期实际落点的最高次数。</p></article>
      </section>

      <Panel className="rq-analysis-overview__chart">
        <header>
          <div><span>最近 {records.length} 个已开奖期</span><h2>实际落点：柱形看次数，折线看位置</h2><p>柱越高，表示当期有更多公式同时得到实际结果；折线越靠上，表示实际结果的名次越靠前。点击任一期可继续核验。</p></div>
          <Button size="sm" onClick={onOpenLanding}><BarChart3 className="h-4 w-4" />查看完整落点趋势</Button>
        </header>
        <FormulaDrawLandingChart
          records={records}
          focusedIssue={selectedIssue}
          unitLabel={`${actionWord}次数`}
          onFocusRecord={(record) => setSelectedIssue(record.calculationIssue)}
        />
        {selected && <div className="rq-analysis-overview__chart-selection" role="status"><span><b>{selected.targetIssue} 期</b>：{String(selected.specialNumber).padStart(2, "0")} · {selected.actualLabel}，{actionWord}{selected.count}次，{selected.rankLabel}。</span><Button size="sm" onClick={() => onOpenEvidence(selected)}>核验这一期<ArrowRight className="h-4 w-4" /></Button></div>}
      </Panel>

      <Panel className="rq-analysis-overview__insight">
        <div className="rq-analysis-overview__insight-icon"><ShieldCheck className="h-5 w-5" /></div>
        <div><span>本次可直接读出的结论</span><h2>{report.landing.insight}</h2><p>这是对已开奖数据的描述，不代表下一期一定重复相同趋势。</p></div>
      </Panel>

      <section className="rq-analysis-overview__status" aria-label="公式与数据健康状态">
        <article>
          <header><span><ShieldCheck className="h-4 w-4" />公式健康</span><Badge tone={attentionFormulas ? "yellow" : "green"}>{attentionFormulas ? `${attentionFormulas} 条需留意` : "全部正常"}</Badge></header>
          <strong>{healthyFormulas}<small> / {report.health.rows.length} 条状态正常</small></strong>
          <p>异常包括样本不足、连续未通过、近期波动或计算错误；健康度只用于排查公式。</p>
        </article>
        <article>
          <header><span><Database className="h-4 w-4" />数据健康</span><Badge tone={report.dataHealth.status === "healthy" ? "green" : "yellow"}>{report.dataHealth.status === "healthy" ? "状态正常" : "需要检查"}</Badge></header>
          <strong>{report.dataHealth.recordCount}<small> 期开奖记录</small></strong>
          <p>{dataStale ? "数据超过36小时未更新，请先确认最新开奖是否已同步。" : `最近数据为 ${report.dataHealth.latestIssue ?? "-"} 期，未发现阻断分析的问题。`}</p>
        </article>
        <article>
          <header><span><Clock3 className="h-4 w-4" />样本覆盖</span><Badge tone={coverageComplete ? "green" : "yellow"}>{coverageComplete ? "覆盖完整" : "样本较少"}</Badge></header>
          <strong>{records.length}<small> / {report.window} 个已开奖期</small></strong>
          <p>{coverageComplete ? `已覆盖最近${report.window}个已开奖期；待开奖期单独保留，不计入指标。` : `当前只有${records.length}个可验证期，比例与连续表现需要谨慎理解。`}</p>
        </article>
      </section>

      <div className="rq-analysis-overview__health-action"><Button size="sm" variant="ghost" onClick={onOpenDiagnostics}><ShieldCheck className="h-4 w-4" />查看公式诊断</Button></div>

      <Panel className="rq-analysis-overview__recent">
        <header><div><span>最近三期</span><h2>实际落点记录</h2></div><p>点击一行后，下方只出现一个明确的核验入口。</p></header>
        <div className="rq-analysis-overview__records" role="list" aria-label="最近三期实际落点">
          {latestRecords.map((record) => (
            <button
              key={record.calculationIssue}
              type="button"
              data-overview-record={record.calculationIssue}
              aria-pressed={selectedIssue === record.calculationIssue}
              className={cn("rq-analysis-overview__record", selectedIssue === record.calculationIssue && "is-selected")}
              onClick={() => setSelectedIssue(record.calculationIssue)}
            >
              <span><small>开奖期</small><b>{record.targetIssue}</b></span>
              <span><small>特码与结果</small><b>{String(record.specialNumber).padStart(2, "0")} · {record.actualLabel}</b></span>
              <span><small>{actionWord}次数</small><b>{record.count} 次</b></span>
              <span><small>当期位置</small><b>{record.rankLabel}</b></span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>
        {selected && (
          <div className="rq-analysis-overview__selection" role="status">
            <span>{selected.targetIssue} 期实际开出 <b>{String(selected.specialNumber).padStart(2, "0")} · {selected.actualLabel}</b>，{actionWord} {selected.count} 次，{selected.rankLabel}。</span>
            <Button size="sm" onClick={() => onOpenEvidence(selected)}>查看此期明细<ArrowRight className="h-4 w-4" /></Button>
          </div>
        )}
      </Panel>

      <p className="rq-analysis-overview__note"><AlertTriangle className="h-4 w-4" />历史表现用于理解公式行为和发现数据问题，不是投注建议。{report.dataHealth.status === "healthy" && <CheckCircle2 className="h-4 w-4" />}</p>
    </div>
  );
}
