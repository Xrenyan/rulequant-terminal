"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select, Label } from "@/components/ui/field";
import { formulaObservationVersionKey, type FormulaObservationVersion } from "@/lib/formula-observation/formula-observation";
import { enrollFormulaObservation, readFormulaObservations, synchronizeFormulaObservations, OBSERVATION_EVENT } from "@/lib/formula-observation/observation-storage";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

export function FormulaObservationMonitor({ draws, rules, config, ready }: { draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; ready: boolean }) {
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready || !draws.length) return;
    let active = true;
    void synchronizeFormulaObservations(draws, rules, config).then(() => { if (active) setError(""); }, () => { if (active) setError("观察记录暂时没有更新，已有记录仍保留在本机。"); });
    return () => { active = false; };
  }, [draws, rules, config, ready, retry]);
  return error ? <p role="alert" className="mx-4 my-2 rounded-xl border border-amber-300/30 p-3 text-sm">{error}<Button size="sm" onClick={() => setRetry((n) => n + 1)}>重试</Button></p> : null;
}

export function FormulaObservationPanel({ rule, draws, config }: { rule: RuleRecord; draws: DrawRecord[]; config: RuleQuantConfig }) {
  const [state, setState] = useState<{ ruleId: string; versions: FormulaObservationVersion[] }>();
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(20);
  const [reload, setReload] = useState(0);
  const currentKey = useMemo(() => formulaObservationVersionKey(rule, config), [rule, config]);
  const versions = useMemo(() => state?.ruleId === rule.id ? [...state.versions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [], [state, rule.id]);
  const current = versions.find((version) => version.id === currentKey);
  const selected = versions.find((version) => version.id === selectedId) ?? current ?? versions[0];
  const checked = selected?.predictions.filter((prediction) => prediction.success !== undefined) ?? [];
  const correct = checked.filter((prediction) => prediction.success).length;
  const pending = (selected?.predictions.length ?? 0) - checked.length;
  useEffect(() => {
    let active = true;
    function read() { void readFormulaObservations(rule.id).then((values) => { if (active) { setState({ ruleId: rule.id, versions: values }); setMessage(""); } }, () => { if (active) setMessage("暂时读不到本机观察记录，请重试。"); }); }
    read(); window.addEventListener(OBSERVATION_EVENT, read);
    return () => { active = false; window.removeEventListener(OBSERVATION_EVENT, read); };
  }, [rule.id, reload]);
  async function start() {
    setBusy(true);
    try { await enrollFormulaObservation(rule, draws, config); setSelectedId(currentKey); setMessage("已保存本期公式结果。收到后续开奖后会自动核对。"); }
    catch (error) { setMessage(error instanceof Error && !/Error|Database|IndexedDB|Quota|Transaction/i.test(error.message) && /[\u4e00-\u9fff]/.test(error.message) ? error.message : "没有开始记录，请检查公式能否计算，以及浏览器是否允许保存本机数据。"); }
    finally { setBusy(false); }
  }
  return <Panel className="rq-observation-tracking p-4 sm:p-5">
    <h3 className="text-lg font-semibold">开始记录后的表现</h3>
    <p className="mt-2 text-sm text-slate-500">先保存还没核对开奖的公式结果，再记录后续对错。只统计本机提前保存过的期次；没有记录的期次不补算。</p>
    {!current && <Button className="mt-3" variant="primary" disabled={busy || !rule.enabled || !draws.length} onClick={start}>{busy ? "正在保存…" : "从现在开始记录这条公式"}</Button>}
    {!rule.enabled && <p className="mt-2 text-sm">公式已停用。以前保存的结果仍会核对，重新启用后才能继续记录。</p>}
    {message && <p className="mt-3 text-sm" role="status">{message}<Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>重新读取</Button></p>}
    {selected && <>
      {versions.length > 1 && <div className="mt-4"><Label>查看哪个版本</Label><Select aria-label="选择公式观察版本" value={selected.id} onChange={(e) => { setSelectedId(e.target.value); setShown(20); }}>{versions.map((version, index) => <option key={version.id} value={version.id}>{version.id === currentKey ? "当前公式" : `之前的公式${versions.length - index}`} · {new Date(version.startedAt).toLocaleDateString("zh-CN")}</option>)}</Select><p className="mt-2 text-sm text-slate-500">公式或计算设置改变后重新记录，之前的成绩单独保留。</p></div>}
      <p className="mt-3 text-sm">开始时间：{new Date(selected.startedAt).toLocaleString("zh-CN")}</p>
      <p className="mt-3 text-base"><b>{checked.length}</b> 次已核对：对 <b>{correct}</b> 次，错 <b>{checked.length - correct}</b> 次；<b>{pending}</b> 次等待后续开奖或缺少的期次。</p>
      {selected.captureError && <p role="alert" className="mt-2 text-sm">{selected.captureError}</p>}
      <details className="mt-3"><summary className="cursor-pointer py-2">查看已保存的每期结果（{selected.predictions.length}条）</summary><div className="grid gap-2">{[...selected.predictions].reverse().slice(0, shown).map((prediction) => <article key={prediction.baseIssue} className="rounded-xl border border-slate-300/20 p-3"><b>用第{prediction.baseIssue}期计算 · {prediction.success === undefined ? "待核对" : prediction.success ? "正确" : "错误"}</b><p className="mt-1 text-sm">当时结果：{prediction.calculation.mappedResult.join("、")}</p><p className="mt-1 text-sm text-slate-500">保存于{new Date(prediction.capturedAt).toLocaleString("zh-CN")}{prediction.checkedIssues?.length ? `；核对第${prediction.checkedIssues.join("、")}期，开${prediction.specials?.join("、")}` : ""}</p></article>)}</div>{shown < selected.predictions.length && <Button className="mt-2" onClick={() => setShown((n) => n + 20)}>再看20条</Button>}</details>
    </>}
    <p className="mt-3 text-sm text-slate-500">打开本系统并更新数据时自动记录和核对。换设备不会自动带走本机观察记录。</p>
  </Panel>;
}
