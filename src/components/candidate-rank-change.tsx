"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { explainRankChange } from "@/lib/reference-history/rank-change";
import type { CandidateNumber, CandidatePoolReport, CandidateZodiac, ReferenceHistoryItem, RuleQuantConfig } from "@/types/domain";

export function CandidateRankChange({ report, candidate, history, config, ruleIds, onOpenRule }: {
  report: CandidatePoolReport; candidate?: CandidateNumber | CandidateZodiac; history: ReferenceHistoryItem[];
  config: RuleQuantConfig; ruleIds: string[]; onOpenRule: (id: string) => void;
}) {
  const [shown, setShown] = useState(5);
  const change = useMemo(() => candidate ? explainRankChange(report, candidate, history, config) : undefined, [report, candidate, history, config]);
  if (!candidate) return null;
  return <section className="mt-4 rounded-xl border border-slate-300/20 p-4">
    <h4 className="font-semibold">为什么排名变了</h4>
    {!change ? <p className="mt-2 text-sm text-slate-500">还没有上一期可对照的完整记录。保存本期结果，后续更新时就能查看排名变化。</p> : <>
      <p className="mt-2 text-sm">在全部{"number" in candidate ? "49个号码" : "12个生肖"}中，上次保存的第{change.previousIssue}期排第{change.previousRank}位，本期第{change.currentRank}位，{change.movement === 0 ? "名次不变" : `${change.movement > 0 ? "上升" : "下降"}${Math.abs(change.movement)}位`}。</p>
      <p className="mt-2 text-sm text-slate-500">以下列出对它评分影响变化最大的公式；其他号码或生肖的变化也会影响名次。</p>
      {change.changes.length ? <><ul className="mt-2 grid gap-2">{change.changes.slice(0, shown).map((item) => {
        const content = <><span className="min-w-0 break-words">{item.name}</span><span className="shrink-0">{item.kind === "added" ? "本期开始影响它" : item.kind === "removed" ? "本期不再影响它" : item.delta > 0 ? "更支持它" : "更不支持它"}</span></>;
        return <li key={item.ruleId}>{ruleIds.includes(item.ruleId)
          ? <Link className="flex min-h-11 items-center justify-between gap-3 rounded-xl p-2 text-sm hover:bg-blue-500/10" href={`/formula-detail?ruleId=${encodeURIComponent(item.ruleId)}`} onClick={() => onOpenRule(item.ruleId)}>{content}</Link>
          : <div className="flex min-h-11 items-center justify-between gap-3 p-2 text-sm">{content}<span>已移除</span></div>}</li>;
      })}</ul>{shown < change.changes.length && <Button size="sm" onClick={() => setShown((n) => n + 10)}>继续查看（{Math.min(shown, change.changes.length)}/{change.changes.length}条）</Button>}</> : <p className="mt-2 text-sm">它的公式评分没有变化，名次差别来自其他结果的变化或同分排序。</p>}
    </>}
  </section>;
}
