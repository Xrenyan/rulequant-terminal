"use client";

import { useDeferredValue, useState } from "react";
import { Clock3, PauseCircle, Play, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { RuleObservationController } from "@/lib/rule-observation/use-rule-observation";
import styles from "./rule-observation-panel.module.css";

type Props = { controller: RuleObservationController; onInspectRule?: (ruleId: string, calculationIssue: string) => void };

export function RuleObservationSettings({ controller }: Props) {
  return <Panel className={styles.panel}>
    <header className={styles.heading}><ShieldCheck size={20} aria-hidden="true" /><div><h3>错期暂停观察</h3><p>错一期，先暂停三期。公式还会继续核对，方便你观察。</p></div></header>
    <div className={styles.setting}>
      <label htmlFor="wrong-period-enabled"><strong>自动暂停</strong><span>只管理已启用、参与综合参考的正式公式，不改你手动停用的设置。</span></label>
      <button id="wrong-period-enabled" className={styles.switch} type="button" role="switch" aria-checked={controller.settings.enabled} disabled={!controller.ready} onClick={() => controller.setEnabled(!controller.settings.enabled)} aria-label="自动暂停"><span /></button>
    </div>
    <div className={styles.setting}>
      <label htmlFor="wrong-period-auto-resume"><strong>观察三期后自动恢复</strong><span>关闭后，观察满三期也会等待你手动点击恢复。</span></label>
      <button id="wrong-period-auto-resume" className={styles.switch} type="button" role="switch" aria-checked={controller.settings.autoResume} disabled={!controller.ready || !controller.settings.enabled} onClick={() => controller.setAutoResume(!controller.settings.autoResume)} aria-label="观察三期后自动恢复"><span /></button>
    </div>
    <div className={styles.example}><Clock3 size={17} aria-hidden="true" /><p>例如：268 期确认错了，269、270、271 期只观察，272 期恢复。期间再错也不会重新倒计时，你随时可以提前恢复。</p></div>
    <p className={styles.note}>从开启后的新开奖开始，不因过去的错期批量停用。未开奖、缺失或计算异常不算错。记录保存在当前浏览器；关闭网页期间，会在下次打开并更新开奖后补记，不发送站外通知。</p>
    <p className={styles.note}>关闭自动暂停会解除当前观察；再次开启从当时最新开奖开始。此功能只是管理参与状态，不代表之后更容易准确。</p>
    {controller.storageError && <p role="status" className={styles.warning}>{controller.storageError}</p>}
  </Panel>;
}

export function RuleObservationPanel({ controller, onInspectRule }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const query = useDeferredValue(search.trim().toLowerCase());
  const paused = controller.pausedRules.filter(({ rule, pause }) => `${rule.name} ${rule.formula} ${pause.causeIssue}`.toLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(paused.length / 10));
  const visiblePage = Math.min(page, pages - 1);
  const events = [...controller.state.events].reverse().filter((event) => `${event.ruleName} ${event.message} ${event.issue}`.toLowerCase().includes(query));
  const historyPages = Math.max(1, Math.ceil(events.length / 10));
  const visibleHistoryPage = Math.min(historyPage, historyPages - 1);
  return <Panel className={styles.panel}>
    <header className={styles.heading}><PauseCircle size={20} aria-hidden="true" /><div><h3>暂停观察</h3><p>暂停的公式不加入新的综合参考，原有记录和历史统计不变。</p></div><Badge tone={controller.pausedRules.length ? "yellow" : "green"}>{controller.pausedRules.length} 条观察中</Badge></header>
    <div className={styles.tools}>
      <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setHistoryPage(0); }} placeholder="查找公式或错期" aria-label="查找观察公式或错期" className={styles.search} />
      <Button size="sm" aria-expanded={showHistory} onClick={() => { setShowHistory(!showHistory); controller.acknowledgeEvents(); }}>{showHistory ? "收起记录" : "查看变化记录"}</Button>
    </div>
    {!controller.ready ? <p role="status" className={styles.empty}>正在核对最新开奖和观察记录…</p> : !controller.settings.enabled ? <p className={styles.empty}>自动暂停当前已关闭，可在设置的“错期暂停观察”中开启。</p> : paused.length === 0 ? <p className={styles.empty}>{query ? "没有找到符合条件的观察公式。" : "目前没有暂停中的公式。新开奖确认某条公式错了后，会在这里记录。"}</p> : <div className={styles.cards}>
      {paused.slice(visiblePage * 10, visiblePage * 10 + 10).map(({ rule, pause, remaining }) => <article className={styles.card} key={rule.id}>
        <div className={styles.cardTop}><div><h4>{rule.name}</h4><p>{pause.causeIssue} 期{pause.causeNeedsReview ? "原核对有更正，请复核" : "确认未通过"} · {pause.calculationIssue} 期计算</p></div><Badge tone="yellow">{remaining ? `还观察 ${remaining} 期` : "等你恢复"}</Badge></div>
        <p className={styles.output}>{pause.causeOutput}</p>
        <ol className={styles.progress} aria-label={`${rule.name} 的三期观察进度`}>
          {[0, 1, 2].map((index) => {
            const sample = pause.samples[index];
            return <li key={index} data-result={sample?.result ?? "pending"}><span>{sample?.issue ?? `第 ${index + 1} 期观察`}</span><strong>{sample ? sample.result === "passed" ? "核对通过" : sample.result === "failed" ? "未通过" : "暂无法核对" : "等待开奖"}</strong>{sample?.output && <small>{sample.output}</small>}</li>;
          })}
        </ol>
        <div className={styles.cardBottom}><p>观察期结果只记录，不计入新的综合参考。{!rule.enabled || rule.participatesInReference === false ? "此公式也已被手动停用或排除，恢复观察不会改变该设置。" : ""}</p><div className={styles.actions}>{onInspectRule && <Button size="sm" onClick={() => onInspectRule(rule.id, pause.calculationIssue)}>查看错期计算</Button>}<Button size="sm" onClick={() => controller.resumeRule(rule.id)}><Play size={15} aria-hidden="true" />{remaining ? "提前恢复" : "恢复使用"}</Button></div></div>
      </article>)}
    </div>}
    {pages > 1 && <div className={styles.pagination}><span>共 {paused.length} 条 · {visiblePage + 1} / {pages} 页</span><Button size="sm" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>上一页</Button><Button size="sm" disabled={visiblePage + 1 >= pages} onClick={() => setPage(visiblePage + 1)}>下一页</Button></div>}
    {showHistory && <section className={styles.history} aria-label="观察变化记录"><h4>变化记录</h4><p className={styles.note}>保留最近 500 条变化。每次开始观察、手动恢复和自动恢复都有记录。</p>{!events.length ? <p className={styles.empty}>暂时没有记录。</p> : <ol>{events.slice(visibleHistoryPage * 10, visibleHistoryPage * 10 + 10).map((event) => <li key={event.id}><div><strong>{event.ruleName}</strong><span>{event.issue} 期</span></div><p>{event.message}</p>{event.samples && <small>{event.samples.map((sample) => `${sample.issue}：${sample.result === "passed" ? "通过" : sample.result === "failed" ? "未通过" : "暂无法核对"}`).join(" · ")}</small>}</li>)}</ol>}{historyPages > 1 && <div className={styles.pagination}><span>{visibleHistoryPage + 1} / {historyPages} 页</span><Button size="sm" disabled={!visibleHistoryPage} onClick={() => setHistoryPage(visibleHistoryPage - 1)}>上一页</Button><Button size="sm" disabled={visibleHistoryPage + 1 >= historyPages} onClick={() => setHistoryPage(visibleHistoryPage + 1)}>下一页</Button></div>}</section>}
    {controller.storageError && <p role="status" className={styles.warning}>{controller.storageError}</p>}
  </Panel>;
}
