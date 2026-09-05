"use client";

import { Bookmark, GitCompareArrows, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import type { FormulaAnalysisFilters, SavedFormulaAnalysisView } from "@/lib/formula-analysis/types";
import type { FormulaSummaryTargetType } from "@/lib/formula-summary/formula-summary";
import type { RuleRecord } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { FORMULA_ANALYSIS_WINDOWS, normalizeFormulaAnalysisWindow } from "@/lib/formula-analysis/windows";

const WINDOWS = FORMULA_ANALYSIS_WINDOWS.map((value) => ({ value, label: `最近${value}期` }));

const TARGET_TYPES: Array<{ value: FormulaSummaryTargetType; label: string }> = [
  { value: "zodiac", label: "生肖" },
  { value: "tail", label: "尾数" },
  { value: "head", label: "头数" },
  { value: "sum", label: "合数" },
  { value: "segment", label: "段位" },
  { value: "element", label: "五行" },
  { value: "color", label: "波色" },
  { value: "half-head", label: "半头" },
  { value: "half-color", label: "半波" },
  { value: "door", label: "门数" },
  { value: "number", label: "号码" },
];

export function FormulaAnalysisToolbar({
  filters,
  rules,
  savedViews,
  selectedViewId,
  statusMessage,
  onChange,
  onSave,
  onRestore,
  onDelete,
  onOpenMobileFilters,
}: {
  filters: FormulaAnalysisFilters;
  rules: RuleRecord[];
  savedViews: SavedFormulaAnalysisView[];
  selectedViewId: string;
  statusMessage?: string;
  onChange: (filters: FormulaAnalysisFilters) => void;
  onSave: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenMobileFilters: () => void;
}) {
  const enabledRules = rules.filter((rule) => rule.enabled);
  const selectedRule = filters.ruleIds.length === 1 ? filters.ruleIds[0] : "all";
  return (
    <section className="rq-analysis-toolbar" aria-label="分析筛选条件">
      <div className="rq-analysis-toolbar__primary">
        <label>分析期数<Select aria-label="分析期数" value={filters.window} onChange={(event) => onChange({ ...filters, window: normalizeFormulaAnalysisWindow(event.target.value) })}>
          {WINDOWS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select></label>
        <div className="rq-segmented-control" aria-label="公式动作">
          <Button size="sm" variant={filters.action === "exclude" ? "primary" : "ghost"} aria-pressed={filters.action === "exclude"} onClick={() => onChange({ ...filters, action: "exclude" })}>排除结果</Button>
          <Button size="sm" variant={filters.action === "include" ? "primary" : "ghost"} aria-pressed={filters.action === "include"} onClick={() => onChange({ ...filters, action: "include" })}>支持结果</Button>
        </div>
      </div>

      <div className="rq-analysis-toolbar__secondary">
        <Select aria-label="结果类型" value={filters.targetType} onChange={(event) => onChange({ ...filters, targetType: event.target.value as FormulaSummaryTargetType })}>
          {TARGET_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
        <Select aria-label="公式组" value={selectedRule} onChange={(event) => onChange({ ...filters, ruleIds: event.target.value === "all" ? [] : [event.target.value] })}>
          <option value="all">全部启用公式</option>
          {enabledRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
        </Select>
        <Select aria-label="对比模式" value={filters.compare.kind === "window" ? String(filters.compare.value) : "none"} onChange={(event) => onChange({
          ...filters,
          compare: event.target.value === "none"
            ? { kind: "none" }
            : { kind: "window", value: normalizeFormulaAnalysisWindow(event.target.value) },
        })}>
          <option value="none">不对比</option>
          {WINDOWS.filter((item) => item.value !== filters.window).map((item) => <option key={item.value} value={item.value}>对比{item.label}</option>)}
        </Select>
        <Select aria-label="保存的视图" value={selectedViewId || "none"} onChange={(event) => onRestore(event.target.value)}>
          <option value="none">选择保存视图</option>
          {savedViews.map((view) => <option key={view.id} value={view.id}>{view.isDefault ? "★ " : ""}{view.name}</option>)}
        </Select>
        <Button size="sm" onClick={onSave}><Save className="h-4 w-4" />保存视图</Button>
        {selectedViewId && <Button size="icon" variant="ghost" aria-label="删除当前保存视图" onClick={() => onDelete(selectedViewId)}><Trash2 className="h-4 w-4" /></Button>}
      </div>

      <button type="button" className="rq-analysis-toolbar__mobile-trigger" onClick={onOpenMobileFilters}>
        <SlidersHorizontal className="h-4 w-4" />
        <span><b>{TARGET_TYPES.find((item) => item.value === filters.targetType)?.label}</b><small>{selectedRule === "all" ? "全部公式" : "自选公式"} · {filters.compare.kind === "none" ? "不对比" : "已对比"}</small></span>
        <GitCompareArrows className="h-4 w-4" />
      </button>
      <span className={statusMessage ? "rq-analysis-toolbar__status" : "sr-only"}><Bookmark className="h-4 w-4" />{statusMessage || "当前筛选可保存为常用视图"}</span>
    </section>
  );
}
