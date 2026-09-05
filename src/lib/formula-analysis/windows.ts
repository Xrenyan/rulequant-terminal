export const FORMULA_ANALYSIS_WINDOWS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200] as const;
export type FormulaAnalysisWindow = typeof FORMULA_ANALYSIS_WINDOWS[number];
export const DEFAULT_FORMULA_ANALYSIS_WINDOW: FormulaAnalysisWindow = 10;

/** Round finite values to the nearest ten, then clamp to the supported range. */
export function normalizeFormulaAnalysisWindow(value: unknown): FormulaAnalysisWindow {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric)
    ? Math.min(200, Math.max(10, Math.round(numeric / 10) * 10)) as FormulaAnalysisWindow
    : DEFAULT_FORMULA_ANALYSIS_WINDOW;
}
