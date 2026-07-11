"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Crosshair, RefreshCw, XCircle } from "lucide-react";
import { analyzeBinaryTrend, analyzeSpecialRule, buildPositionNineGridTriggers, drawNumbers, DRAW_POSITION_LABELS, SPECIAL_RULE_SPECS, type BinaryTrendReport, type SpecialRuleDetail, type SpecialRuleId } from "@/lib/special-analysis/special-analysis";
import { getNumberAttributes } from "@/lib/engine/attributes";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type Props = {
  draws: DrawRecord[];
  config: RuleQuantConfig;
  dataSourceLabel: string;
  sourceLoading: boolean;
  onSync: () => void;
};

function numberLabel(number: number, config: RuleQuantConfig) {
  const zodiac = getNumberAttributes(number, config).zodiac;
  return `${String(number).padStart(2, "0")} ${zodiac}`;
}

function ZodiacNumberNineGrid({ draws, config }: { draws: DrawRecord[]; config: RuleQuantConfig }) {
  const triggers = useMemo(() => buildPositionNineGridTriggers(draws), [draws]);
  const [selectedIssue, setSelectedIssue] = useState("");
  const selected = triggers.find((trigger) => trigger.triggerDraw.issue === selectedIssue) ?? triggers[0];

  if (!selected) {
    return (
      <Panel className="p-4 sm:p-5">
        <Badge tone="cyan">位置触发九宫格</Badge>
        <h3 className="mt-3 font-semibold text-white">当前开奖记录中还没有找到触发期</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">当上期的特码再次出现在下一期的平1至平6或特码位置时，系统会自动生成三期三列九宫格。</p>
      </Panel>
    );
  }

  const selectedIndex = Math.max(0, triggers.findIndex((trigger) => trigger.triggerDraw.issue === selected.triggerDraw.issue));
  const positionLabel = DRAW_POSITION_LABELS[selected.positionIndex];
  const previousSpecialZodiac = getNumberAttributes(selected.previousSpecial, config).zodiac;
  const rows = [
    { label: "上一期", draw: selected.previousDraw },
    { label: "触发期", draw: selected.triggerDraw },
    { label: "下一期", draw: selected.nextDraw },
  ];

  const goToTrigger = (index: number) => setSelectedIssue(triggers[Math.min(Math.max(index, 0), triggers.length - 1)].triggerDraw.issue);

  return (
    <Panel className="rq-nine-grid-workbench p-4 sm:p-5">
      <div className="rq-nine-grid-toolbar">
        <div><p className="rq-eyebrow">位置触发九宫盘</p><h3>三期 · 三列关系观察</h3><p>以触发位置为中心读取相邻三列，肖与号码保持在同一格。</p></div>
        <div className="rq-nine-grid-nav">
          <Button size="icon" disabled={selectedIndex === 0} onClick={() => goToTrigger(selectedIndex - 1)} aria-label="上一个触发"><ChevronLeft className="h-4 w-4" /></Button>
          <Select value={selected.triggerDraw.issue} onChange={(event) => setSelectedIssue(event.target.value)} aria-label="选择九宫格触发期">
            {triggers.map((trigger) => <option key={trigger.triggerDraw.issue} value={trigger.triggerDraw.issue}>{trigger.triggerDraw.issue}期 · {DRAW_POSITION_LABELS[trigger.positionIndex]}</option>)}
          </Select>
          <Button size="icon" disabled={selectedIndex >= triggers.length - 1} onClick={() => goToTrigger(selectedIndex + 1)} aria-label="下一个触发"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="rq-nine-grid-layout">
        <div className="rq-nine-board" role="grid" aria-label={`${selected.triggerDraw.issue}期九宫格`}>
          <div className="rq-nine-board__corner" />
          {selected.columnIndexes.map((columnIndex) => <div key={columnIndex} className="rq-nine-board__column">{DRAW_POSITION_LABELS[columnIndex]}</div>)}
          {rows.map((row, rowIndex) => (
            <div className="contents" key={row.label}>
              <div className={cn("rq-nine-board__time", rowIndex === 1 && "is-trigger")}><span>{row.label}</span><strong>{row.draw?.issue.slice(-3) ?? "—"}</strong></div>
              {selected.columnIndexes.map((columnIndex) => {
                const number = row.draw ? drawNumbers(row.draw)[columnIndex] : undefined;
                const attributes = number ? getNumberAttributes(number, config) : undefined;
                const isAnchor = rowIndex === 1 && columnIndex === selected.positionIndex;
                return <div key={columnIndex} className={cn("rq-nine-cell", rowIndex === 1 && "is-trigger-row", isAnchor && "is-anchor")}>
                  {number && attributes ? <><strong>{String(number).padStart(2, "0")}</strong><span>{attributes.zodiac}</span><small><i className={`rq-color-dot rq-color-dot--${attributes.color}`} />{attributes.color}{isAnchor ? " · 定位" : ""}</small>{isAnchor && <Crosshair className="rq-nine-cell__anchor" />}</> : <span className="rq-nine-cell__empty">待开奖</span>}
                </div>;
              })}
            </div>
          ))}
        </div>

        <aside className="rq-nine-inspector">
          <div className="rq-nine-inspector__hero"><span>触发号码</span><strong>{String(selected.previousSpecial).padStart(2, "0")}</strong><b>{previousSpecialZodiac}</b></div>
          <dl>
            <div><dt>上期</dt><dd>{selected.previousDraw.issue} 期</dd></div>
            <div><dt>本期位置</dt><dd>{positionLabel}</dd></div>
            <div><dt>读取列</dt><dd>{selected.columnIndexes.map((index) => DRAW_POSITION_LABELS[index]).join(" · ")}</dd></div>
            <div><dt>历史触发</dt><dd>{triggers.length} 次</dd></div>
          </dl>
          <p>平1取前三列，特码取后三列，中间位置读取前一列、本列、后一列。触发期固定在棋盘中间行。</p>
        </aside>
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "bad" | "warn" }) {
  return (
    <div className={cn(
      "min-w-0 rounded-lg border p-4",
      tone === "good" && "border-emerald-300/20 bg-emerald-300/[0.07]",
      tone === "bad" && "border-rose-300/20 bg-rose-300/[0.07]",
      tone === "warn" && "border-amber-300/20 bg-amber-300/[0.07]",
      tone === "default" && "border-white/[0.08] bg-white/[0.035]",
    )}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 break-words text-[24px] font-semibold leading-none text-white tabular-nums">{value}</p>
    </div>
  );
}

function ResultBoard({ detail }: { detail?: SpecialRuleDetail }) {
  if (!detail) return null;
  const active = detail.normalizedValue;
  const isHalfHead = detail.targetLabels.some((label) => label.includes("头"));
  const isSevenTail = detail.targetLabels.some((label) => label.startsWith("七尾"));
  const isElement = detail.targetLabels.some((label) => label.endsWith("行"));
  const sevenTailValues = isSevenTail ? detail.targetLabels[0].replace(/^七尾\s*/, "").split("、").map(Number) : [];
  const cells = isHalfHead
    ? [
        { value: 1, label: "0头单" }, { value: 2, label: "0头双" }, { value: 3, label: "1头单" },
        { value: 4, label: "1头双" }, { value: 5, label: "2头单" }, { value: 6, label: "两种解释" },
        { value: 7, label: "原文未定义" }, { value: 8, label: "3头双" }, { value: 9, label: "4头单" },
        { value: 0, label: "4头双" },
      ]
    : isSevenTail
      ? Array.from({ length: 10 }, (_, value) => ({ value, label: sevenTailValues.includes(value) ? "入选" : "未选" }))
    : isElement
      ? ["金", "木", "水", "火", "土"].map((label, index) => ({ value: index + 1, label: `${label}行` }))
    : detail.targetLabels[0]?.includes("波")
      ? [{ value: 0, label: "红波" }, { value: 1, label: "蓝波" }, { value: 2, label: "绿波" }]
      : [1, 2, 3, 4, 5].map((value) => ({ value, label: `${value}门` }));

  return (
    <div className={cn("grid gap-2", isHalfHead || isSevenTail ? "grid-cols-2 sm:grid-cols-5" : cells.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-5")}>
      {cells.map((cell) => (
        <div
          key={cell.value}
          className={cn(
            "flex min-h-20 min-w-0 flex-col items-center justify-center rounded-md border p-2 text-center transition",
            !isSevenTail && active === cell.value && "border-cyan-200/60 bg-cyan-300/15 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.12)]",
            isSevenTail && sevenTailValues.includes(cell.value) && "border-cyan-200/60 bg-cyan-300/15 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.12)]",
            isSevenTail && active === cell.value && !sevenTailValues.includes(cell.value) && "border-amber-200/50 bg-amber-300/10 text-amber-50",
            active !== cell.value && !(isSevenTail && sevenTailValues.includes(cell.value)) && "border-white/[0.08] bg-black/20 text-slate-400",
            cell.value === 6 && isHalfHead && "border-amber-300/30",
          )}
        >
          <strong className="text-xl tabular-nums">{cell.value}</strong>
          <span className="mt-1 text-xs leading-4">{cell.label}</span>
        </div>
      ))}
    </div>
  );
}

function TrendCard({ report }: { report: BinaryTrendReport }) {
  const top = [...report.probabilities].sort((a, b) => b.probability - a.probability)[0];
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{report.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{report.explanation}</p>
        </div>
        <Badge tone={report.backtestRate >= 55 ? "green" : "yellow"}>滚动验证 {report.backtestRate}%</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {report.probabilities.map((item) => (
          <div key={item.label} className={cn("rounded-lg border p-4", item.label === top.label ? "border-cyan-300/35 bg-cyan-300/10" : "border-white/[0.08] bg-white/[0.03]")}>
            <p className="text-sm text-slate-400">下一期参考：{item.label}</p>
            <p className="mt-2 text-[28px] font-semibold text-white tabular-nums">{item.probability}%</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {report.sequence20.map((item, index) => (
          <span key={`${item}-${index}`} className={cn("flex h-8 w-8 items-center justify-center rounded-md border text-xs", item === report.labels[0] ? "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-100" : "border-violet-300/20 bg-violet-300/[0.08] text-violet-100")}>{item}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {report.modelWeights.slice(0, 3).map((model) => <Badge key={model.label} tone="slate">{model.label} {model.weight}%</Badge>)}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">最近20期 · 当前连续 {report.currentLabel} {report.currentStreak} 期 · 学习样本 {report.trainingSamples} 期 · 概率差 {report.confidence}% · 历史滚动验证 {report.backtestSuccess}/{report.backtestTotal}</p>
    </Panel>
  );
}

function DetailRow({ detail, config }: { detail: SpecialRuleDetail; config: RuleQuantConfig }) {
  const [open, setOpen] = useState(false);
  const status = detail.error ? "error" : detail.ambiguous ? "ambiguous" : detail.success === undefined ? "pending" : detail.success ? "success" : "failed";
  const outputVerb = detail.targetLabels.some((label) => label.startsWith("七尾")) ? "参考" : "杀";
  return (
    <div className={cn(
      "rounded-lg border p-3 sm:p-4",
      status === "success" && "border-emerald-300/20 bg-emerald-300/[0.055]",
      status === "failed" && "border-rose-300/28 bg-rose-300/[0.075]",
      status === "ambiguous" && "border-amber-300/25 bg-amber-300/[0.06]",
      (status === "pending" || status === "error") && "border-white/[0.08] bg-white/[0.03]",
    )}>
      <button type="button" className="grid w-full grid-cols-1 gap-3 text-left md:grid-cols-[120px_1fr_180px_32px] md:items-center" onClick={() => setOpen((value) => !value)}>
        <div>
          <p className="font-semibold text-white tabular-nums">{detail.currentIssue}期</p>
          <p className="mt-1 text-xs text-slate-500">计算期</p>
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm text-slate-200">原始 {detail.rawResult} → {detail.normalizerSteps.join(" → ")} → {outputVerb} {detail.targetLabels.join(" / ") || "未定义"}</p>
          <p className="mt-1 break-words text-xs text-slate-500">{detail.currentNumbers.map((number) => numberLabel(number, config)).join("  ")}</p>
        </div>
        <div className="flex items-center gap-2 md:justify-end">
          {status === "success" && <><CheckCircle2 className="h-4 w-4 text-emerald-300" /><span className="text-sm text-emerald-100">{detail.nextIssue} 开 {detail.nextSpecial ? numberLabel(detail.nextSpecial, config) : "-"}，正确</span></>}
          {status === "failed" && <><XCircle className="h-4 w-4 text-rose-300" /><span className="text-sm text-rose-100">{detail.nextIssue} 开 {detail.nextSpecial ? numberLabel(detail.nextSpecial, config) : "-"}，错误</span></>}
          {status === "ambiguous" && <><AlertTriangle className="h-4 w-4 text-amber-300" /><span className="text-sm text-amber-100">结果6待确认</span></>}
          {status === "pending" && <Badge tone="slate">等待下一期</Badge>}
          {status === "error" && <Badge tone="rose">计算异常</Badge>}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-4 grid gap-3 border-t border-white/[0.08] pt-4 text-xs sm:grid-cols-2">
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
            <p className="text-slate-500">变量取值</p>
            <p className="mt-2 break-words leading-6 text-slate-200">{Object.entries(detail.variables).map(([key, value]) => `${key}=${value}`).join("；") || "无"}</p>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
            <p className="text-slate-500">排除号码</p>
            <p className="mt-2 break-words leading-6 text-slate-200">{detail.targetNumbers.map((number) => numberLabel(number, config)).join("、") || "待确认"}</p>
          </div>
          {detail.error && <p className="text-rose-200 sm:col-span-2">{detail.error}</p>}
        </div>
      )}
    </div>
  );
}

export function SpecialAnalysisView({ draws, config, dataSourceLabel, sourceLoading, onSync }: Props) {
  const [selectedId, setSelectedId] = useState<SpecialRuleId>("kill-color");
  const [specialTab, setSpecialTab] = useState<"nine-grid" | "rules" | "trends" | "ledger">("nine-grid");
  const [visibleCount, setVisibleCount] = useState(30);
  const report = useMemo(() => analyzeSpecialRule(selectedId, draws, config), [selectedId, draws, config]);
  const sizeTrend = useMemo(() => analyzeBinaryTrend(draws, "size"), [draws]);
  const parityTrend = useMemo(() => analyzeBinaryTrend(draws, "parity"), [draws]);
  const latest = report.details.at(-1);
  const visibleDetails = report.details.slice(-visibleCount).reverse();

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Badge tone="cyan">独立观察窗口</Badge><Badge tone="green">{draws.length}期真实数据</Badge></div>
            <h2 className="mt-3 text-xl font-semibold text-white">专项规则概率观察</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">单独检查杀半头、杀一波、杀一门和二分类走势。这里不会自动混入综合推荐；先把规则解释和历史表现看清楚，再决定是否正式入库。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="slate">数据来源：{dataSourceLabel}</Badge>
            <Button variant="primary" disabled={sourceLoading} onClick={onSync}><RefreshCw className={cn("h-4 w-4", sourceLoading && "animate-spin")} />{sourceLoading ? "同步中" : "同步最新开奖"}</Button>
          </div>
        </div>
      </Panel>

      <nav className="rq-workspace-tabs" aria-label="专项分析工作区">
        {[
          ["nine-grid", "九宫盘", "位置关系"],
          ["rules", "专项规则", "概率与结果"],
          ["trends", "大小单双", "走势学习"],
          ["ledger", "逐期流水", `${report.details.length} 期`],
        ].map(([key, label, hint]) => <button key={key} type="button" className={cn("rq-workspace-tab", specialTab === key && "rq-workspace-tab--active")} onClick={() => setSpecialTab(key as typeof specialTab)}><span>{label}</span><small>{hint}</small></button>)}
      </nav>

      {specialTab === "nine-grid" && <ZodiacNumberNineGrid draws={draws} config={config} />}

      {specialTab === "rules" && <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        {SPECIAL_RULE_SPECS.map((spec) => (
          <button key={spec.id} type="button" onClick={() => { setSelectedId(spec.id); setVisibleCount(30); }} className={cn("min-h-20 rounded-lg border p-3 text-left transition", selectedId === spec.id ? "border-cyan-300/40 bg-cyan-300/12" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.055]")}>
            <p className="font-medium text-white">{spec.name}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{spec.formula}</p>
          </button>
        ))}
      </div>

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="font-semibold text-white">{report.spec.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{report.spec.formula}</p>
            <p className="mt-1 text-xs text-slate-500">{report.spec.explanation}</p>
          </div>
          <Badge tone="cyan">{report.spec.orderMode}序</Badge>
        </div>
        {(selectedId === "half-head-l" || selectedId === "half-head-d") && (
          <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-3 text-sm leading-6 text-amber-100">
            原文把结果 6 同时写成“3头单”和“2头双”，并且没有写结果 7 的映射。主成功率暂不计算这些期，下面同时给出结果6两种解释的独立概率，避免系统乱猜。
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="有效验证" value={`${report.total}期`} />
          <Metric label="正确" value={report.success} tone="good" />
          <Metric label="错误" value={report.failed} tone="bad" />
          <Metric label="历史成功率" value={`${report.successRate}%`} tone={report.successRate >= 70 ? "good" : "warn"} />
          <Metric label="最近10期" value={`${report.recentSuccess}/${report.recentTotal}`} />
          <Metric label="当前状态" value={report.currentStreakType === "none" ? "暂无" : `${report.currentStreakType === "success" ? "连对" : "连错"}${report.currentStreak}期`} tone={report.currentStreakType === "failed" ? "bad" : "good"} />
        </div>
        {report.scenarios.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.scenarios.map((scenario) => <div key={scenario.label} className="rounded-lg border border-amber-300/15 bg-amber-300/[0.045] p-3 text-sm text-amber-50"><strong>{scenario.label}</strong><span className="ml-3 tabular-nums">{scenario.success}/{scenario.total} · {scenario.rate}%</span></div>)}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel className="p-4 sm:p-5">
          <h3 className="font-semibold text-white">最新一期计算图</h3>
          {latest ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="使用期号" value={latest.currentIssue} />
                <Metric label="原始结果" value={latest.rawResult} />
                <Metric label="归一化结果" value={latest.normalizedValue} />
                <Metric label="最终输出" value={`${selectedId === "seven-tail-d" ? "参考" : "杀"} ${latest.targetLabels.join(" / ") || "待确认"}`} tone={latest.ambiguous ? "warn" : "good"} />
              </div>
              <div className="mt-4"><ResultBoard detail={latest} /></div>
              <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/20 p-3 text-sm leading-6 text-slate-300">
                <p>{Object.entries(latest.variables).map(([key, value]) => `${key}=${value}`).join("；")}</p>
                <p className="mt-1 text-slate-500">计算：{latest.rawResult} → {latest.normalizerSteps.join(" → ")} → {latest.targetLabels.join(" / ")}</p>
              </div>
            </>
          ) : <p className="mt-4 text-sm text-slate-500">暂无开奖数据。</p>}
        </Panel>
        <Panel className="p-4 sm:p-5">
          <h3 className="font-semibold text-white">明确错期</h3>
          <p className="mt-1 text-xs text-slate-500">显示被杀中的下一期开奖期号。</p>
          <div className="mt-4 flex max-h-72 flex-wrap gap-2 overflow-auto pr-1">
            {report.wrongIssues.map((issue) => <Badge key={issue} tone="rose">{issue}</Badge>)}
            {!report.wrongIssues.length && <Badge tone="green">当前没有错误记录</Badge>}
          </div>
          <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-slate-300">
            最大连对：<strong className="ml-1 text-white">{report.maxSuccessStreak}期</strong>
            {report.ambiguousCount > 0 && <p className="mt-2 text-amber-200">另有 {report.ambiguousCount} 期结果为6，等待确认映射。</p>}
          </div>
        </Panel>
      </div>
      </>}

      {specialTab === "trends" && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendCard report={sizeTrend} />
        <TrendCard report={parityTrend} />
      </div>
      )}

      {specialTab === "ledger" && (
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-semibold text-white">逐期计算流水账</h3><p className="mt-1 text-xs text-slate-500">每一期变量、计算、输出、下一期开奖和对错都可以展开检查。</p></div>
          <Badge tone="slate">显示 {Math.min(visibleCount, report.details.length)}/{report.details.length}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {visibleDetails.map((detail) => <DetailRow key={detail.currentIssue} detail={detail} config={config} />)}
        </div>
        {report.details.length > visibleCount && <div className="mt-4 flex justify-center"><Button onClick={() => setVisibleCount((count) => count + 30)}>加载更早30期</Button></div>}
      </Panel>
      )}
    </div>
  );
}
