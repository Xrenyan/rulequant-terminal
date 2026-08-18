import { describe, expect, it } from "vitest";
import {
  FORMULA_ANALYSIS_DEFAULT_FILTERS,
  deleteAnalysisView,
  parseAnalysisSearchParams,
  readSavedViews,
  restoreAnalysisView,
  saveAnalysisView,
  serializeAnalysisSearchParams,
  writeSavedViews,
} from "@/lib/formula-analysis/saved-views";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("formula analysis saved views", () => {
  it("parses safe URL defaults and rejects unsupported parity or size types", () => {
    expect(parseAnalysisSearchParams(new URLSearchParams("range=99&action=other&type=parity&tab=bad")))
      .toEqual(FORMULA_ANALYSIS_DEFAULT_FILTERS);
  });

  it("round-trips one comparison dimension and sorted formula ids", () => {
    const filters = parseAnalysisSearchParams(new URLSearchParams(
      "tab=diagnostics&range=30&action=include&type=half-color&rules=zeta,alpha&compare=window&compareValue=50",
    ));

    expect(filters).toEqual({
      tab: "diagnostics",
      window: 30,
      action: "include",
      targetType: "half-color",
      ruleIds: ["alpha", "zeta"],
      compare: { kind: "window", value: 50 },
    });
    expect(serializeAnalysisSearchParams(filters).toString()).toBe(
      "tab=diagnostics&range=30&action=include&type=half-color&rules=alpha%2Czeta&compare=window&compareValue=50",
    );
  });

  it("persists schema-versioned views and recovers from corrupt storage", () => {
    const storage = new MemoryStorage();
    const filters = { ...FORMULA_ANALYSIS_DEFAULT_FILTERS, window: 30 as const };
    const views = saveAnalysisView([], {
      id: "view-1",
      name: "常用30期",
      filters,
      makeDefault: true,
      now: "2026-08-18T10:00:00.000Z",
    });
    writeSavedViews(views, storage);

    expect(readSavedViews(storage)).toEqual([{
      schemaVersion: 1,
      id: "view-1",
      name: "常用30期",
      filters,
      isDefault: true,
      createdAt: "2026-08-18T10:00:00.000Z",
      updatedAt: "2026-08-18T10:00:00.000Z",
    }]);

    storage.setItem("rulequant:formula-analysis-views:v1", "{bad json");
    expect(readSavedViews(storage)).toEqual([]);
  });

  it("keeps exactly one default and removes deleted views", () => {
    const first = saveAnalysisView([], {
      id: "first",
      name: "第一个",
      filters: FORMULA_ANALYSIS_DEFAULT_FILTERS,
      makeDefault: true,
      now: "2026-08-18T10:00:00.000Z",
    });
    const second = saveAnalysisView(first, {
      id: "second",
      name: "第二个",
      filters: { ...FORMULA_ANALYSIS_DEFAULT_FILTERS, action: "include" },
      makeDefault: true,
      now: "2026-08-18T11:00:00.000Z",
    });

    expect(second.map((view) => [view.id, view.isDefault])).toEqual([
      ["first", false],
      ["second", true],
    ]);
    expect(deleteAnalysisView(second, "second")).toEqual([{ ...second[0], isDefault: false }]);
  });

  it("drops deleted rule ids during restore without losing other filters", () => {
    const [view] = saveAnalysisView([], {
      id: "view",
      name: "自选公式",
      filters: {
        ...FORMULA_ANALYSIS_DEFAULT_FILTERS,
        tab: "evidence",
        ruleIds: ["keep", "deleted"],
        compare: { kind: "group", ruleIds: ["deleted", "compare"] },
      },
      now: "2026-08-18T10:00:00.000Z",
    });

    expect(restoreAnalysisView(view, new Set(["keep", "compare"]))).toEqual({
      filters: {
        ...view.filters,
        ruleIds: ["keep"],
        compare: { kind: "group", ruleIds: ["compare"] },
      },
      removedRuleIds: ["deleted"],
    });
    expect(JSON.stringify(view)).not.toContain("issue");
    expect(JSON.stringify(view)).not.toContain("targetKey");
  });
});
