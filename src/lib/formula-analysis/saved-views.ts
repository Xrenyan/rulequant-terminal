import type {
  FormulaAnalysisCompare,
  FormulaAnalysisFilters,
  FormulaAnalysisTab,
  FormulaAnalysisWindow,
  SavedFormulaAnalysisView,
} from "@/lib/formula-analysis/types";
import type {
  FormulaSummaryAction,
  FormulaSummaryTargetType,
} from "@/lib/formula-summary/formula-summary";

const STORAGE_KEY = "rulequant:formula-analysis-views:v1";

const TABS = new Set<FormulaAnalysisTab>([
  "overview",
  "landing",
  "diagnostics",
  "evidence",
]);
const WINDOWS = new Set<FormulaAnalysisWindow>([10, 30, 50]);
const ACTIONS = new Set<FormulaSummaryAction>(["exclude", "include"]);
const TARGET_TYPES = new Set<FormulaSummaryTargetType>([
  "zodiac",
  "color",
  "sum",
  "tail",
  "head",
  "half-head",
  "half-color",
  "door",
  "element",
  "segment",
  "number",
]);

export const FORMULA_ANALYSIS_DEFAULT_FILTERS: FormulaAnalysisFilters = {
  tab: "overview",
  window: 10,
  action: "exclude",
  targetType: "zodiac",
  ruleIds: [],
  compare: { kind: "none" },
};

function sortedUniqueIds(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : value.split(",");
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort();
}

function parseWindow(value: string | null): FormulaAnalysisWindow | undefined {
  if (value === null) return undefined;
  const candidate = Number(value) as FormulaAnalysisWindow;
  return WINDOWS.has(candidate) ? candidate : undefined;
}

function parseTargetType(value: string | null): FormulaSummaryTargetType | undefined {
  return value !== null && TARGET_TYPES.has(value as FormulaSummaryTargetType)
    ? value as FormulaSummaryTargetType
    : undefined;
}

function parseCompare(params: URLSearchParams): FormulaAnalysisCompare {
  const kind = params.get("compare");
  const value = params.get("compareValue");
  if (kind === "window") {
    const window = parseWindow(value);
    return window ? { kind, value: window } : { kind: "none" };
  }
  if (kind === "group") {
    const ruleIds = sortedUniqueIds(value ?? "");
    return ruleIds.length > 0 ? { kind, ruleIds } : { kind: "none" };
  }
  if (kind === "target-type") {
    const targetType = parseTargetType(value);
    return targetType ? { kind, value: targetType } : { kind: "none" };
  }
  return { kind: "none" };
}

export function parseAnalysisSearchParams(params: URLSearchParams): FormulaAnalysisFilters {
  const tabValue = params.get("tab");
  const actionValue = params.get("action");
  const tab = tabValue !== null && TABS.has(tabValue as FormulaAnalysisTab)
    ? tabValue as FormulaAnalysisTab
    : FORMULA_ANALYSIS_DEFAULT_FILTERS.tab;
  const window = parseWindow(params.get("range")) ?? FORMULA_ANALYSIS_DEFAULT_FILTERS.window;
  const action = actionValue !== null && ACTIONS.has(actionValue as FormulaSummaryAction)
    ? actionValue as FormulaSummaryAction
    : FORMULA_ANALYSIS_DEFAULT_FILTERS.action;
  const targetType = parseTargetType(params.get("type"))
    ?? FORMULA_ANALYSIS_DEFAULT_FILTERS.targetType;

  return {
    tab,
    window,
    action,
    targetType,
    ruleIds: sortedUniqueIds(params.get("rules") ?? ""),
    compare: parseCompare(params),
  };
}

export function serializeAnalysisSearchParams(filters: FormulaAnalysisFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tab", filters.tab);
  params.set("range", String(filters.window));
  params.set("action", filters.action);
  params.set("type", filters.targetType);
  const ruleIds = sortedUniqueIds(filters.ruleIds);
  if (ruleIds.length > 0) params.set("rules", ruleIds.join(","));
  if (filters.compare.kind !== "none") {
    params.set("compare", filters.compare.kind);
    if (filters.compare.kind === "group") {
      params.set("compareValue", sortedUniqueIds(filters.compare.ruleIds).join(","));
    } else {
      params.set("compareValue", String(filters.compare.value));
    }
  }
  return params;
}

function isFilters(value: unknown): value is FormulaAnalysisFilters {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FormulaAnalysisFilters>;
  return typeof candidate.tab === "string"
    && TABS.has(candidate.tab as FormulaAnalysisTab)
    && typeof candidate.window === "number"
    && WINDOWS.has(candidate.window as FormulaAnalysisWindow)
    && typeof candidate.action === "string"
    && ACTIONS.has(candidate.action as FormulaSummaryAction)
    && typeof candidate.targetType === "string"
    && TARGET_TYPES.has(candidate.targetType as FormulaSummaryTargetType)
    && Array.isArray(candidate.ruleIds)
    && candidate.ruleIds.every((id) => typeof id === "string")
    && Boolean(candidate.compare)
    && typeof candidate.compare === "object"
    && ["none", "window", "group", "target-type"].includes(candidate.compare.kind);
}

function isSavedView(value: unknown): value is SavedFormulaAnalysisView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedFormulaAnalysisView>;
  return candidate.schemaVersion === 1
    && typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.name === "string"
    && candidate.name.trim().length > 0
    && typeof candidate.isDefault === "boolean"
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string"
    && isFilters(candidate.filters);
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readSavedViews(storage?: Storage): SavedFormulaAnalysisView[] {
  const target = resolveStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(views: SavedFormulaAnalysisView[], storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  target.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function saveAnalysisView(
  views: SavedFormulaAnalysisView[],
  input: {
    id: string;
    name: string;
    filters: FormulaAnalysisFilters;
    makeDefault?: boolean;
    now?: string;
  },
): SavedFormulaAnalysisView[] {
  const now = input.now ?? new Date().toISOString();
  const existing = views.find((view) => view.id === input.id);
  const makeDefault = input.makeDefault ?? existing?.isDefault ?? false;
  const next: SavedFormulaAnalysisView = {
    schemaVersion: 1,
    id: input.id,
    name: input.name.trim(),
    filters: input.filters,
    isDefault: makeDefault,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const withoutCurrent = views.filter((view) => view.id !== input.id);
  const normalized = makeDefault
    ? withoutCurrent.map((view) => ({ ...view, isDefault: false }))
    : withoutCurrent;
  return [...normalized, next];
}

export function deleteAnalysisView(
  views: SavedFormulaAnalysisView[],
  id: string,
): SavedFormulaAnalysisView[] {
  return views.filter((view) => view.id !== id);
}

export function restoreAnalysisView(
  view: SavedFormulaAnalysisView,
  availableRuleIds: Set<string>,
): { filters: FormulaAnalysisFilters; removedRuleIds: string[] } {
  const removed = new Set<string>();
  const keepAvailable = (ids: string[]) => ids.filter((id) => {
    const exists = availableRuleIds.has(id);
    if (!exists) removed.add(id);
    return exists;
  });
  const ruleIds = keepAvailable(view.filters.ruleIds);
  const compare = view.filters.compare.kind === "group"
    ? { ...view.filters.compare, ruleIds: keepAvailable(view.filters.compare.ruleIds) }
    : view.filters.compare;
  return {
    filters: { ...view.filters, ruleIds, compare },
    removedRuleIds: [...removed].sort(),
  };
}
