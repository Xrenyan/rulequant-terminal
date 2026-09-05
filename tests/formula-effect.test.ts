import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRuleDetail, checkRuleSuccess } from "@/lib/formula-engine/formula-engine";
import { evaluateFormulaEffect } from "@/lib/formula-analysis/formula-effect";
import { buildFormulaHealthReport } from "@/lib/formula-analysis/formula-health";
import { buildFormulaAnalysisReport } from "@/lib/formula-analysis/build-analysis-report";
import { FORMULA_ANALYSIS_WINDOWS, normalizeFormulaAnalysisWindow } from "@/lib/formula-analysis/windows";
import { FORMULA_ANALYSIS_DEFAULT_FILTERS, parseAnalysisSearchParams, serializeAnalysisSearchParams, saveAnalysisView, readSavedViews, writeSavedViews } from "@/lib/formula-analysis/saved-views";
import type { RuleRecord, DrawRecord } from "@/types/domain";

const rule: RuleRecord = { id: "effect", name: "effect", category: "kill_door", formula: "1", normalizer: "auto", target: "next_special", verifyMode: "next_special", orderMode: "L", enabled: true, periodSpan: 1, positionPattern: [], tags: [], description: "", sourceFile: "test", examples: [], createdAt: "", updatedAt: "" };
const draw = (index: number, special = 14): DrawRecord => ({ issue: String(1000 + index), n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special });
function evaluate(category: RuleRecord["category"], mapped: Array<string | number>, options: Partial<RuleRecord> = {}) {
  const chosen = { ...rule, category, ...options };
  const count = Math.max(chosen.periodSpan, chosen.verifyOffset ?? 1, category === "eight_zodiac_two_period" ? 2 : 1);
  const draws = Array.from({ length: count + 1 }, (_, index) => draw(index));
  const future = draws.slice(1).map((item) => normalizeDraw(item, defaultConfig));
  const detail = calculateRuleDetail({ rule: chosen, current: normalizeDraw(draws[0], defaultConfig), futureDraws: future, config: defaultConfig, periodIndex: 0 });
  detail.mappedResult = mapped;
  detail.futureChecks.forEach((check, index) => { check.success = checkRuleSuccess(chosen, detail, future[index]); });
  detail.success = category === "eight_zodiac_two_period" ? detail.futureChecks.every((check) => check.success) : detail.futureChecks[(chosen.verifyOffset ?? 1) - 1].success;
  const input = { rule: chosen, details: [detail], config: defaultConfig, draws };
  return { result: evaluateFormulaEffect(input), input };
}

describe("uniform formula effects", () => {
  it("counts one and five excluded numbers once, not as equal-difficulty rules", () => {
    expect(evaluate("kill_door", [1, 1]).result.expectedRate).toBeCloseTo(48 / 49 * 100);
    expect(evaluate("kill_half_head", [1, 2, 3, 4, 5, 5]).result.expectedRate).toBeCloseTo(44 / 49 * 100);
    const result = evaluate("kill_door", [1]).result;
    expect(result.actualRate).toBe(100);
    expect(result.differencePoints).toBeCloseTo(100 / 49);
    expect(result.interpretation).toContain("不能证明未来更好");
    expect(result.actualInterval![0]).toBeLessThan(30);
  });
  it("uses unequal zodiac coverage and opposite inclusion semantics", () => {
    const five = Object.entries(defaultConfig.zodiacTable).find(([, numbers]) => numbers.length === 5)![0];
    const four = Object.entries(defaultConfig.zodiacTable).find(([, numbers]) => numbers.length === 4)![0];
    expect(evaluate("include_zodiac", [five, five]).result.expectedRate).toBeCloseTo(5 / 49 * 100);
    expect(evaluate("include_zodiac", [four]).result.expectedRate).toBeCloseTo(4 / 49 * 100);
    expect(evaluate("kill_zodiac", [five]).result.expectedRate).toBeCloseTo(44 / 49 * 100);
  });
  it("uses every future period for two-period zodiac and just the offset for ordinary rules", () => {
    const zodiac = Object.keys(defaultConfig.zodiacTable)[0];
    const p = defaultConfig.zodiacTable[zodiac].length / 49;
    expect(evaluate("eight_zodiac_two_period", [zodiac]).result.expectedRate).toBeCloseTo(p ** 2 * 100);
    expect(evaluate("eight_zodiac_two_period", [zodiac], { periodSpan: 3 }).result.expectedRate).toBeCloseTo(p ** 3 * 100);
    expect(evaluate("include_zodiac", [zodiac], { periodSpan: 3, verifyOffset: 2 }).result.expectedRate).toBeCloseTo(p * 100);
  });
  it("supports numeric custom targets but refuses unknown verification targets and broken maps", () => {
    expect(evaluate("custom_set", [14]).result.expectedRate).toBeCloseTo(100 / 49);
    const { result, input } = evaluate("custom_set", [14], { target: "next_regular" });
    expect(result.status).toBe("unavailable");
    expect(result.actualRate).toBe(100);
    expect(result.expectedRate).toBeNull();
    expect(evaluateFormulaEffect({ ...input, error: "bad formula" }).reason).toContain("计算有误");
    expect(evaluateFormulaEffect({ ...input, rule, config: { ...defaultConfig, zodiacTable: {} } }).status).toBe("unavailable");
    expect(evaluate("custom_set", [0, 50]).result.status).toBe("unavailable");
  });
  it("preserves actual offset outcomes when the first and second future draws disagree", () => {
    const chosen = { ...rule, category: "include_parity" as const, verifyOffset: 2, periodSpan: 2 };
    const draws = [draw(0), draw(1, 13), draw(2, 14)];
    const detail = calculateRuleDetail({ rule: chosen, current: normalizeDraw(draws[0], defaultConfig), futureDraws: draws.slice(1).map((item) => normalizeDraw(item, defaultConfig)), config: defaultConfig, periodIndex: 0 });
    expect(detail.futureChecks[0].success).not.toBe(detail.futureChecks[1].success);
    const result = evaluateFormulaEffect({ rule: chosen, details: [detail], draws, config: defaultConfig });
    expect(result.actualRate).toBe(detail.futureChecks[1].success ? 100 : 0);
    expect(result.expectedRate).toBeCloseTo(25 / 49 * 100);
  });
  it("excludes missing, invalid, duplicate and incomplete cases; zero samples has no percentage", () => {
    const { input } = evaluate("kill_door", [1]);
    expect(evaluateFormulaEffect({ ...input, draws: [] })).toMatchObject({ sampleCount: 0, actualRate: null, expectedRate: null });
    expect(evaluateFormulaEffect({ ...input, draws: [input.draws[0], { ...input.draws[1], special: 1 }] }).sampleCount).toBe(0);
    expect(evaluateFormulaEffect({ ...input, details: [input.details[0], input.details[0]] }).sampleCount).toBe(1);
    expect(evaluateFormulaEffect({ ...input, draws: [...input.draws, input.draws[1]] }).sampleCount).toBe(0);
    expect(evaluateFormulaEffect({ ...input, details: [{ ...input.details[0], futureChecks: [] }] }).sampleCount).toBe(0);
  });
  it("does not invent a historical table when raw attributes differ", () => {
    const { input } = evaluate("include_zodiac", ["鼠"]);
    input.details[0].futureChecks[0].specialAttributes.zodiac = "历史不同生肖";
    expect(evaluateFormulaEffect(input)).toMatchObject({ status: "unavailable", expectedRate: null, sampleCount: 1 });
  });
});

describe("analysis ranges", () => {
  it("normalizes 10..200 by ten including malformed and clamped inputs", () => {
    expect(FORMULA_ANALYSIS_WINDOWS).toHaveLength(20);
    for (const [value, expected] of [[10, 10], [200, 200], [999, 200], [-5, 10], [24, 20], [NaN, 10], [Infinity, 10], ["bad", 10], [null, 10]] as const) expect(normalizeFormulaAnalysisWindow(value)).toBe(expected);
  });
  it("preserves 200-period views and 190-period comparison in URLs and storage", () => {
    const filters = { ...FORMULA_ANALYSIS_DEFAULT_FILTERS, window: 200 as const, compare: { kind: "window" as const, value: 190 as const } };
    expect(parseAnalysisSearchParams(serializeAnalysisSearchParams(filters))).toEqual(filters);
    let stored = "";
    const storage: Storage = { length: 1, clear: () => { stored = ""; }, key: () => "views", removeItem: () => { stored = ""; }, getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
    const views = saveAnalysisView([], { id: "200", name: "最近200期", filters });
    writeSavedViews(views, storage);
    expect(readSavedViews(storage)).toEqual(views);
  });
  it("honors selected 200 in health and retains recent comparison windows", () => {
    const health = buildFormulaHealthReport({ draws: Array.from({ length: 211 }, (_, index) => draw(index)), rules: [rule], config: defaultConfig, window: 200 });
    expect(health.rows[0].windows[200].sampleSize).toBe(200);
    expect(health.rows[0].windows[10].sampleSize).toBe(10);
    expect(health.rows[0].effect.sampleCount).toBe(200);
    const report = buildFormulaAnalysisReport({ draws: Array.from({ length: 211 }, (_, index) => draw(index)), rules: [rule], config: defaultConfig, window: 200, action: "exclude", targetType: "door", source: { label: "test" } });
    expect(report.summary.periods).toHaveLength(201);
    expect(report.landing.records).toHaveLength(200);
  });
});
