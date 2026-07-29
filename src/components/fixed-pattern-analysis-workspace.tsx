"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, History, ShieldCheck, Sparkles, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import type {
  FixedPatternAnalysisReport,
  FixedPatternCandidate,
  FixedPatternColor,
  FixedPatternHitStats,
  FixedPatternSourceSummary,
} from "@/lib/special-analysis/fixed-pattern-analysis";
import { cn } from "@/lib/utils";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

type Props = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
};

type Section = "current" | "backtest" | "sources";

const reportCache = new Map<string, FixedPatternAnalysisReport>();

const colorTone: Record<FixedPatternColor, string> = {
  红: "is-red",
  蓝: "is-blue",
  绿: "is-green",
};

function rateLabel(stats: FixedPatternHitStats) {
  return stats.samples ? `${stats.rate}% · ${stats.hits}/${stats.samples}` : "暂无样本";
}

function StatPill({ label, stats }: { label: string; stats: FixedPatternHitStats }) {
  return (
    <span className="rq-fixed-stat-pill">
      <small>{label}</small>
      <strong>{rateLabel(stats)}</strong>
    </span>
  );
}

function CandidateStats({ candidate }: { candidate: FixedPatternCandidate<FixedPatternColor | number> }) {
  return (
    <div className="rq-fixed-candidate__stats">
      <StatPill label="全部" stats={candidate.historicalStats.all} />
      <StatPill label="近10" stats={candidate.historicalStats.last10} />
      <StatPill label="近20" stats={candidate.historicalStats.last20} />
      <StatPill label="近30" stats={candidate.historicalStats.last30} />
    </div>
  );
}

function ColorCard({ candidate }: { candidate: FixedPatternCandidate<FixedPatternColor> }) {
  return (
    <article className={cn("rq-fixed-color-card", colorTone[candidate.value])}>
      <div className="rq-fixed-color-card__head">
        <span>参考 #{candidate.rank}</span>
        <Badge tone="slate">权重占比 {candidate.probability}%</Badge>
      </div>
      <div className="rq-fixed-color-card__value">
        <span aria-hidden="true" />
        <strong>{candidate.value}波</strong>
      </div>
      <p>{candidate.supportSources.length} 份规则资料共同支持</p>
      <CandidateStats candidate={candidate} />
      <div className="rq-fixed-source-tags">
        {candidate.supportSources.map((support) => (
          <span key={support.sourceId}>{support.sourceName}</span>
        ))}
      </div>
    </article>
  );
}

function TailCard({
  candidate,
  featured,
}: {
  candidate: FixedPatternCandidate<number>;
  featured: boolean;
}) {
  return (
    <article className={cn("rq-fixed-tail-card", featured && "is-featured")}>
      <div className="rq-fixed-tail-card__rank">#{candidate.rank}</div>
      <strong>{candidate.value}尾</strong>
      <span>{candidate.probability}%</span>
      <small>{candidate.supportSources.length} 项支持</small>
    </article>
  );
}

function SourceCard({ source }: { source: FixedPatternSourceSummary }) {
  return (
    <article className="rq-fixed-source-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge tone={source.target === "color" ? "cyan" : "violet"}>
            {source.target === "color" ? "波色资料" : "尾数资料"}
          </Badge>
          <h4 className="mt-3">{source.sourceName}</h4>
        </div>
        <strong>{source.historicalStats.all.rate}%</strong>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatPill label="全部" stats={source.historicalStats.all} />
        <StatPill label="近10" stats={source.historicalStats.last10} />
        <StatPill label="近20" stats={source.historicalStats.last20} />
        <StatPill label="近30" stats={source.historicalStats.last30} />
      </div>
    </article>
  );
}

function CurrentResult({ report }: { report: FixedPatternAnalysisReport }) {
  const next = report.nextPrediction;
  if (!next) {
    return (
      <Panel className="p-5">
        <Badge tone="yellow">样本不足</Badge>
        <h3 className="mt-3">至少需要两期开奖，才能生成滚动观察结果。</h3>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="rq-fixed-hero p-5">
        <div className="rq-fixed-hero__copy">
          <p className="rq-eyebrow">下一期固定资料观察</p>
          <h3>{next.targetIssue}期 · {next.targetDate ?? "开奖日待同步"}</h3>
          <p>
            使用 {next.basedOnIssue} 期特号 {String(next.basedOnSpecial).padStart(2, "0")}（{next.basedOnZodiac}）
            和此前全部历史数据滚动计算。
          </p>
        </div>
        <div className="rq-fixed-hero__guard">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>只用已开奖数据</strong>
            <span>每一期回测都不会读取未来结果</span>
          </div>
        </div>
      </Panel>

      <section className="rq-fixed-result-grid">
        <div className="min-w-0">
          <div className="rq-fixed-section-heading">
            <div>
              <span><Waves aria-hidden="true" /></span>
              <div>
                <h3>高权重两个波色</h3>
                <p>三份波色资料按历史稳定度动态加权</p>
              </div>
            </div>
            <Badge tone="cyan">Top 2</Badge>
          </div>
          <div className="rq-fixed-color-grid">
            {next.top2Colors.map((candidate) => (
              <ColorCard key={candidate.value} candidate={candidate} />
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="rq-fixed-section-heading">
            <div>
              <span><Sparkles aria-hidden="true" /></span>
              <div>
                <h3>高权重尾数</h3>
                <p>Top5用于重点观察，Top7用于扩大观察范围</p>
              </div>
            </div>
            <Badge tone="violet">Top 5 / 7</Badge>
          </div>
          <Panel className="rq-fixed-tail-surface p-4">
            <div className="rq-fixed-tail-grid">
              {next.top7Tails.map((candidate, index) => (
                <TailCard key={candidate.value} candidate={candidate} featured={index < 5} />
              ))}
            </div>
            <div className="rq-fixed-tail-legend">
              <span><i className="is-featured" />Top5重点尾</span>
              <span><i />Top7补充尾</span>
            </div>
          </Panel>
        </div>
      </section>

      <Panel className="p-5">
        <div className="rq-fixed-section-heading">
          <div>
            <span><BookOpenCheck aria-hidden="true" /></span>
            <div>
              <h3>本期规则依据</h3>
              <p>每一项结果都能追溯到原始固定资料</p>
            </div>
          </div>
          <Badge tone="green">{next.sourcePredictions.length} 项依据</Badge>
        </div>
        <div className="rq-fixed-prediction-list mt-4">
          {next.sourcePredictions.map((prediction) => (
            <article key={prediction.sourceId}>
              <div>
                <Badge tone={prediction.target === "color" ? "cyan" : "violet"}>
                  {prediction.target === "color" ? "波色" : "尾数"}
                </Badge>
                <strong>{prediction.sourceName}</strong>
              </div>
              <p>
                {prediction.values.map((value) => `${value}${prediction.target === "color" ? "波" : "尾"}`).join("、")}
              </p>
              <span>历史权重 {prediction.learnedWeight.toFixed(2)}</span>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BacktestResult({ report }: { report: FixedPatternAnalysisReport }) {
  const groups = [
    { label: "波色 Top2", stats: report.combinedBacktest.colorTop2, tone: "cyan" as const },
    { label: "尾数 Top5", stats: report.combinedBacktest.tailTop5, tone: "violet" as const },
    { label: "尾数 Top7", stats: report.combinedBacktest.tailTop7, tone: "green" as const },
  ];

  return (
    <div className="space-y-4">
      <section className="rq-fixed-backtest-grid">
        {groups.map((group) => (
          <Panel key={group.label} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Badge tone={group.tone}>{group.label}</Badge>
                <strong className="rq-fixed-backtest-rate">{group.stats.all.rate}%</strong>
              </div>
              <CheckCircle2 className="h-6 w-6 text-emerald-300" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              全部 {group.stats.all.hits}/{group.stats.all.samples} 期命中
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatPill label="近10" stats={group.stats.last10} />
              <StatPill label="近20" stats={group.stats.last20} />
              <StatPill label="近30" stats={group.stats.last30} />
            </div>
          </Panel>
        ))}
      </section>

      <Panel className="p-5">
        <div className="rq-fixed-section-heading">
          <div>
            <span><History aria-hidden="true" /></span>
            <div>
              <h3>最近30期滚动验证</h3>
              <p>预测时只使用目标期之前的开奖，随后再核对实际特号</p>
            </div>
          </div>
          <Badge tone="slate">共 {report.combinedBacktest.totalPeriods} 期</Badge>
        </div>
        <div className="rq-fixed-history-list mt-4">
          {report.recentRecords.map((record) => (
            <article key={record.issue}>
              <div className="rq-fixed-history-list__issue">
                <strong>{record.issue}期</strong>
                <span>{record.date ?? "日期未提供"}</span>
              </div>
              <div>
                <small>实际特号</small>
                <strong>{String(record.actualSpecial).padStart(2, "0")} · {record.actualColor}波 · {record.actualTail}尾</strong>
              </div>
              <div>
                <small>波色 Top2</small>
                <span>{record.top2Colors.join("、")}</span>
                <Badge tone={record.colorHit ? "green" : "rose"}>{record.colorHit ? "命中" : "未中"}</Badge>
              </div>
              <div>
                <small>尾数 Top5 / Top7</small>
                <span>{record.top5Tails.join("、")} / {record.top7Tails.join("、")}</span>
                <Badge tone={record.tailTop5Hit ? "green" : record.tailTop7Hit ? "yellow" : "rose"}>
                  {record.tailTop5Hit ? "Top5命中" : record.tailTop7Hit ? "Top7命中" : "未中"}
                </Badge>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function SourceResult({ report }: { report: FixedPatternAnalysisReport }) {
  return (
    <Panel className="p-5">
      <div className="rq-fixed-section-heading">
        <div>
          <span><BookOpenCheck aria-hidden="true" /></span>
          <div>
            <h3>六份固定资料表现</h3>
            <p>资料仍保持原文口径，权重只根据当时可见的历史表现更新</p>
          </div>
        </div>
        <Badge tone="slate">3份波色 · 3份尾数</Badge>
      </div>
      <div className="rq-fixed-source-grid mt-4">
        {report.sourceSummaries.map((source) => (
          <SourceCard key={source.sourceId} source={source} />
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500">
        羊的“防红、绿”只作为弱参考，不计入该资料的历史命中；第一份开奖日波色表已按用户确认补充：4、14、24 日为绿波、红波。
      </p>
    </Panel>
  );
}

export function FixedPatternAnalysisWorkspace({ draws, config }: Props) {
  const [section, setSection] = useState<Section>("current");
  const requestKey = useMemo(() => {
    const latest = draws.at(-1);
    return JSON.stringify([
      draws.length,
      latest?.issue,
      latest?.date,
      latest?.special,
      config.zodiacTable,
      config.colorTable,
    ]);
  }, [draws, config]);
  const [analysis, setAnalysis] = useState<{
    key: string;
    report?: FixedPatternAnalysisReport;
    loading: boolean;
    error: string;
  }>({ key: "", loading: true, error: "" });

  useEffect(() => {
    let disposed = false;
    const cached = reportCache.get(requestKey);
    if (cached) {
      queueMicrotask(() => {
        if (!disposed) setAnalysis({ key: requestKey, report: cached, loading: false, error: "" });
      });
      return () => {
        disposed = true;
      };
    }

    const worker = new Worker(new URL("../workers/special-analysis.worker.ts", import.meta.url));
    queueMicrotask(() => {
      if (!disposed) {
        setAnalysis((current) => ({ ...current, key: requestKey, loading: true, error: "" }));
      }
    });
    worker.onmessage = (event: MessageEvent<{
      ok: boolean;
      report?: FixedPatternAnalysisReport;
      error?: string;
    }>) => {
      if (disposed) return;
      if (event.data.ok && event.data.report) reportCache.set(requestKey, event.data.report);
      setAnalysis({
        key: requestKey,
        report: event.data.report,
        loading: false,
        error: event.data.ok ? "" : event.data.error ?? "固定资料分析失败",
      });
      worker.terminate();
    };
    worker.onerror = (event) => {
      if (disposed) return;
      setAnalysis({
        key: requestKey,
        loading: false,
        error: event.message || "固定资料分析暂时无法启动",
      });
      worker.terminate();
    };
    worker.postMessage({ kind: "fixed-pattern", draws, config, recentLimit: 30 });
    return () => {
      disposed = true;
      worker.terminate();
    };
  }, [draws, config, requestKey]);

  if (analysis.loading || analysis.key !== requestKey) {
    return (
      <Panel className="p-5">
        <div className="rq-inline-progress">
          <span className="rq-progress-spinner" aria-hidden="true" />
          <div>
            <strong>正在回测固定出波与出尾资料</strong>
            <p>计算在后台线程完成，页面切换和滚动不会被阻塞。</p>
          </div>
        </div>
      </Panel>
    );
  }

  if (analysis.error || !analysis.report) {
    return (
      <Panel className="p-5">
        <Badge tone="rose">分析未完成</Badge>
        <h3 className="mt-3">{analysis.error || "开奖记录不足"}</h3>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <nav className="rq-workspace-tabs rq-fixed-tabs" role="tablist" aria-label="波色尾数观察内容">
        <button
          type="button"
          role="tab"
          aria-selected={section === "current"}
          className={cn("rq-workspace-tab", section === "current" && "rq-workspace-tab--active")}
          onClick={() => setSection("current")}
        >
          <span>本期结果</span>
          <small>Top2波色与Top5/7尾</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "backtest"}
          className={cn("rq-workspace-tab", section === "backtest" && "rq-workspace-tab--active")}
          onClick={() => setSection("backtest")}
        >
          <span>历史验证</span>
          <small>全量与近10/20/30期</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "sources"}
          className={cn("rq-workspace-tab", section === "sources" && "rq-workspace-tab--active")}
          onClick={() => setSection("sources")}
        >
          <span>规则来源</span>
          <small>六份资料逐项表现</small>
        </button>
      </nav>

      {section === "current" ? <CurrentResult report={analysis.report} /> : null}
      {section === "backtest" ? <BacktestResult report={analysis.report} /> : null}
      {section === "sources" ? <SourceResult report={analysis.report} /> : null}

      <p className="px-1 text-sm leading-6 text-slate-500">{analysis.report.disclaimer}</p>
    </div>
  );
}
