"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { FORMULA_GROUPS_KEY, parseFormulaGroups, saveFormulaGroup } from "@/lib/candidate-pool/formula-groups";
import { compactReferenceObservationBacktest, REFERENCE_OBSERVATION_WINDOWS } from "@/lib/candidate-pool/candidate-pool";
import type { GroupComparisonReport, ComparisonSummary } from "@/lib/candidate-pool/group-comparison";
import type { BacktestResult, DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";

const cache = new Map<string, GroupComparisonReport>();
const GROUP_EVENT = "rulequant:groups-changed";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener); window.addEventListener(GROUP_EVENT, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(GROUP_EVENT, listener); };
}
function snapshot() { try { return window.localStorage.getItem(FORMULA_GROUPS_KEY) ?? ""; } catch { return ""; } }
const METRICS: Array<[keyof Omit<ComparisonSummary, "total">, string]> = [["top8", "前8个号码"], ["top12", "前12个号码"], ["top18", "前18个号码"], ["zodiac7", "前7个生肖"], ["zodiac9", "前9个生肖"]];

export function FormulaGroupComparison({ draws, rules, config, backtest, selectedRuleIds, onSelect }: {
  draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; backtest?: BacktestResult;
  selectedRuleIds: string[]; onSelect: (ids: string[]) => void;
}) {
  const rawGroups = useSyncExternalStore(subscribe, snapshot, () => "");
  const groups = useMemo(() => parseFormulaGroups(rawGroups), [rawGroups]);
  const [groupId, setGroupId] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [windowSize, setWindowSize] = useState(10);
  const [mode, setMode] = useState<"group" | "unique">("group");
  const [result, setResult] = useState<{ key: string; report?: GroupComparisonReport; error?: string }>();
  const [loadingKey, setLoadingKey] = useState("");
  const [shown, setShown] = useState(20);
  const worker = useRef<Worker | null>(null);
  const availableIds = useMemo(() => new Set(rules.filter((r) => r.enabled && r.participatesInReference !== false).map((r) => r.id)), [rules]);
  const selectedCount = selectedRuleIds.filter((id) => availableIds.has(id)).length;
  const key = useMemo(() => JSON.stringify({ draws, rules, config, windowSize, mode, selectedRuleIds: [...selectedRuleIds].sort() }), [draws, rules, config, windowSize, mode, selectedRuleIds]);
  const report = result?.key === key ? result.report : undefined;
  const loading = loadingKey === key;
  useEffect(() => () => {
    worker.current?.terminate(); worker.current = null;
    setLoadingKey((current) => current === key ? "" : current);
  }, [key]);

  function writeGroups(next: typeof groups) {
    try { window.localStorage.setItem(FORMULA_GROUPS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(GROUP_EVENT)); return true; }
    catch { setNotice("没有保存成功，请检查浏览器是否允许保存本机数据。当前选择仍然可以比较。"); return false; }
  }
  function save() {
    try {
      const id = groupId || crypto.randomUUID();
      const next = saveFormulaGroup(groups, { id, name, ruleIds: selectedRuleIds, updatedAt: new Date().toISOString() });
      if (writeGroups(next)) { setGroupId(id); setNotice(`已保存“${name.trim()}”，下次可以直接选择。`); }
    } catch (error) { setNotice(error instanceof Error ? error.message : "没有保存成功，请重试。"); }
  }
  function run() {
    worker.current?.terminate();
    const cached = cache.get(key);
    setShown(20);
    if (cached) { setResult({ key, report: cached }); setLoadingKey(""); return; }
    setLoadingKey(key); setResult(undefined);
    try {
      const activeWorker = new Worker(new URL("../workers/group-comparison.worker.ts", import.meta.url));
      worker.current = activeWorker;
      activeWorker.onmessage = (event: MessageEvent<{ key: string; ok: boolean; report?: GroupComparisonReport; error?: string }>) => {
        if (worker.current !== activeWorker || event.data.key !== key) return;
        const message = event.data;
        if (message.ok && message.report) {
          cache.set(key, message.report);
          while (cache.size > 4) cache.delete(cache.keys().next().value!);
          setResult({ key, report: message.report });
        } else setResult({ key, error: message.error ?? "比较没有完成，请重试。" });
        setLoadingKey(""); activeWorker.terminate(); worker.current = null;
      };
      activeWorker.onerror = () => {
        if (worker.current !== activeWorker) return;
        setResult({ key, error: "比较没有完成，请稍后重试。" }); setLoadingKey(""); activeWorker.terminate(); worker.current = null;
      };
      activeWorker.postMessage({ key, input: { draws, rules, config, window: windowSize, mode, selectedRuleIds, backtest: backtest ? compactReferenceObservationBacktest(backtest) : undefined } });
    } catch { setResult({ key, error: "暂时无法开始比较，请重新打开页面后重试。" }); setLoadingKey(""); }
  }
  return <Panel className="rq-group-comparison p-5">
    <h3 className="text-lg font-semibold">哪组公式表现更好</h3>
    <p className="mt-2 text-sm text-slate-500">先在上方挑选公式，再与全部公式比较。两边核对相同的开奖，方便看出差别。</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div><Label>我的公式组合</Label><Select aria-label="选择已保存公式组合" value={groupId || "new"} onChange={(e) => {
        const group = groups.find((g) => g.id === e.target.value);
        setGroupId(group?.id ?? ""); setName(group?.name ?? "");
        if (group) { onSelect(group.ruleIds); const missing = group.ruleIds.filter((id) => !availableIds.has(id)).length; setNotice(missing ? `其中${missing}条已停用或不存在，比较时会排除这些公式。` : `已选中“${group.name}”。`); }
      }}><option value="new">新建组合</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.ruleIds.length}条</option>)}</Select></div>
      <div><Label htmlFor="formula-group-name">组合名称</Label><Input id="formula-group-name" value={name} maxLength={60} placeholder="例如：我常看的杀肖公式" onChange={(e) => setName(e.target.value)} /></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Button onClick={save}>保存名称和当前选择</Button>{groupId && <Button variant="ghost" onClick={() => { if (writeGroups(groups.filter((g) => g.id !== groupId))) { setGroupId(""); setName(""); setNotice("已移除组合，公式本身没有删除。"); } }}>移除这个组合</Button>}<span className="text-sm text-slate-500">已选 {selectedRuleIds.length} 条，{selectedCount} 条可参与比较</span></div>
    {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    <div className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_1.7fr_auto]">
      <div><Label>比较多少期</Label><Select aria-label="选择公式组合比较期数" value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))}>{REFERENCE_OBSERVATION_WINDOWS.map((n) => <option key={n} value={n}>最近 {n} 期</option>)}</Select></div>
      <div><Label>想比较什么</Label><Select aria-label="选择公式对比内容" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="group">全部公式与我选的公式</option><option value="unique">相同结果重复计算与只算一份</option></Select></div>
      <Button variant="primary" onClick={run} disabled={loading || (mode === "group" && selectedCount === 0)}>{loading ? "正在比较…" : "开始比较"}</Button>
    </div>
    {mode === "unique" && <p className="mt-3 text-sm text-slate-500">右侧把同一期、同种类型、同样核对期数且结果完全相同的公式算作一份，比较重复意见的影响。原有排序和被排除次数保持原样。</p>}
    {loading && <p role="status" className="mt-4">正在核对最近 {windowSize} 期，完成后会显示两边结果。期间可以继续操作。</p>}
    {result?.key === key && result.error && <p role="alert" className="mt-4">{result.error} <Button onClick={run}>重新比较</Button></p>}
    {!loading && !report && result?.report && <p className="mt-4 text-sm text-slate-500">条件已改变，点击“开始比较”查看当前选择的结果。</p>}
    {report && <>
      <p className="mt-4">两边共同核对了 <b>{report.all.total}</b> 期{report.all.total < report.window ? `，少于所选${report.window}期，其余期次没有两边都可核对的结果` : ""}。</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-300/20"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">查看范围</th><th className="p-3">全部公式</th><th className="p-3">{mode === "group" ? "我选的公式" : "相同结果只算一份"}</th></tr></thead><tbody>{METRICS.map(([metric, label]) => <tr key={metric} className="border-t border-slate-300/20"><th className="p-3 font-medium">{label}</th><td className="p-3">对 {report.all[metric]} 期 · 错 {report.all.total - report.all[metric]} 期</td><td className="p-3">对 {report.selected[metric]} 期 · 错 {report.selected.total - report.selected[metric]} 期</td></tr>)}</tbody></table></div>
      {report.all.total > 0 && <p className="mt-3 text-sm">以“前8个号码”为例，右侧{report.selected.top8 === report.all.top8 ? "与全部公式对的期数相同" : `${report.selected.top8 > report.all.top8 ? "多" : "少"}对了${Math.abs(report.selected.top8 - report.all.top8)}期`}。这是这段历史的对比结果。</p>}
      <details className="mt-4"><summary className="cursor-pointer py-2">逐期查看两边结果（{report.rows.length}期）</summary><div className="grid gap-3">{[...report.rows].reverse().slice(0, shown).map((row) => <article key={row.issue} className="rounded-xl border border-slate-300/20 p-3"><b>第 {row.issue} 期 · 开 {String(row.special).padStart(2, "0")} {row.zodiac}</b><p className="mt-2 text-sm">全部公式前8个：{row.all.top8Numbers.map((n) => String(n).padStart(2, "0")).join("、")} · {row.all.hitTop8 ? "选中" : "未选中"}</p><p className="mt-2 text-sm">右侧前8个：{row.selected.top8Numbers.map((n) => String(n).padStart(2, "0")).join("、")} · {row.selected.hitTop8 ? "选中" : "未选中"}</p><p className="mt-2 text-sm text-slate-500">实际号码在全部49个中：左侧第{row.all.hitNumberRank}位，右侧第{row.selected.hitNumberRank}位。</p></article>)}</div>{shown < report.rows.length && <Button className="mt-3" onClick={() => setShown((n) => n + 20)}>再看20期（已显示{Math.min(shown, report.rows.length)}/{report.rows.length}）</Button>}</details>
    </>}
  </Panel>;
}
