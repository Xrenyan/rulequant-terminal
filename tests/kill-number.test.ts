import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { normalizeDraw, normalizeNumber, normalizeZodiacNumber } from "@/lib/engine/attributes";
import { calculateRule, checkRuleSuccess } from "@/lib/formula-engine/formula-engine";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { buildRuleSignals, buildRuleSignalsFromBacktest } from "@/lib/signal-system/signal-system";
import { buildNumberCandidates } from "@/lib/scoring/scoring-engine";
import { buildFormulaSummaryGroups, buildFormulaSummaryReport } from "@/lib/formula-summary/formula-summary";
import { buildFormulaTargetDomain } from "@/lib/formula-summary/formula-draw-landing";
import { evaluateFormulaEffect } from "@/lib/formula-analysis/formula-effect";
import { buildFormulaAnalysisReport } from "@/lib/formula-analysis/build-analysis-report";
import { buildFormulaLedger, buildOneClickFormulaResults } from "@/lib/formula-ledger/formula-ledger";
import { parseRuleTextFile } from "@/lib/parsers/rule-text-parser";
import { buildRuleLibraryWordHtml } from "@/lib/export/exporters";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const draws: DrawRecord[] = [
  { issue: "101", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "102", n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 49 },
  { issue: "103", n1: 15, n2: 16, n3: 17, n4: 18, n5: 19, n6: 20, special: 48 },
];

function rule(overrides: Partial<RuleRecord> = {}): RuleRecord {
  return {
    id: "kill-number-test", name: "杀特码测试", category: "kill_number", formula: "98",
    normalizer: "subtract_49_to_1_49", target: "special_number", verifyMode: "next_special",
    orderMode: "L", positionPattern: [], periodSpan: 1, enabled: true,
    participatesInReference: true, sourceType: "user_provided", tags: [], description: "",
    sourceFile: "unit", examples: [], createdAt: "2026-09-26", updatedAt: "2026-09-26",
    ...overrides,
  };
}

describe("kill-number normalization", () => {
  it.each([
    [1, 1, [1]], [49, 49, [49]], [50, 1, [50, 1]],
    [98, 49, [98, 49]], [99, 1, [99, 50, 1]], [147, 49, [147, 98, 49]],
    [0, 49, [0, 49]], [-1, 48, [-1, 48]], [-49, 49, [-49, 0, 49]],
  ])("reduces %s to %s using 49", (raw, expected, steps) => {
    expect(normalizeNumber(raw as number)).toEqual({ value: expected, steps });
    const calculation = calculateRule(rule({ formula: String(raw) }), normalizeDraw(draws[0], defaultConfig), defaultConfig);
    expect(calculation).toMatchObject({ rawResult: raw, finalResult: expected, mappedResult: [expected], normalizerSteps: steps });
    if (raw === 99) expect(calculation.process).toEqual(expect.arrayContaining(["99 - 49 = 50", "50 - 49 = 1"]));
  });

  it.each([NaN, Infinity, -Infinity, 1.5, -1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid integer input %s without unbounded processing", (raw) => {
    expect(() => normalizeNumber(raw)).toThrow("安全整数");
  });

  it("bounds the trace of huge safe integers without losing their result", () => {
    for (const raw of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 49_000_000]) {
      const normalized = normalizeNumber(raw);
      const remainder = raw % 49;
      expect(normalized.value).toBe(remainder > 0 ? remainder : remainder + 49);
      expect(normalized.steps).toEqual([raw, normalized.value]);
    }
  });

  it("preserves the independent zodiac subtraction-by-48 convention", () => {
    expect(normalizeZodiacNumber(50)).toEqual({ value: 2, steps: [50, 2] });
    expect(normalizeZodiacNumber(98)).toEqual({ value: 2, steps: [98, 50, 2] });
    const calculation = calculateRule(rule({ category: "kill_zodiac", formula: "98" }), normalizeDraw(draws[0], defaultConfig), defaultConfig);
    expect(calculation.finalResult).toBe(2);
    expect(calculation.mappedResult).toEqual([normalizeDraw({ ...draws[0], special: 2 }, defaultConfig).specialAttributes.zodiac]);
  });
});

describe("kill-number end-to-end semantics", () => {
  it("fails only when the next special is the exact excluded number, including same-zodiac alternatives", () => {
    const chosen = rule();
    const calculation = calculateRule(chosen, normalizeDraw(draws[0], defaultConfig), defaultConfig);
    const excludedZodiac = normalizeDraw(draws[1], defaultConfig).specialAttributes.zodiac;
    const sameZodiacNumber = defaultConfig.zodiacTable[excludedZodiac].find((number) => number !== 49)!;
    expect(checkRuleSuccess(chosen, calculation, normalizeDraw(draws[1], defaultConfig))).toBe(false);
    expect(checkRuleSuccess(chosen, calculation, normalizeDraw(draws[2], defaultConfig))).toBe(true);
    expect(checkRuleSuccess(chosen, calculation, normalizeDraw({ ...draws[2], special: sameZodiacNumber }, defaultConfig))).toBe(true);
    const result = runBacktest({ draws, rules: [chosen], config: defaultConfig }).ruleResults[0];
    expect(result).toMatchObject({ total: 2, success: 1, failed: 1, successRate: 50 });
    expect(result.details.map((detail) => detail.success)).toEqual([false, true]);
    expect(result.details[0].targetLabel).toBe("要杀：49");
  });

  it("emits one number exclusion in current and historical signals and opposes only that candidate", () => {
    const chosen = rule();
    const signals = buildRuleSignals({ draws, rules: [chosen], config: defaultConfig });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ action: "exclude", targetType: "number", targets: [49] });
    expect(signals[0].scoreDelta).toBeLessThan(0);
    const candidates = buildNumberCandidates(defaultConfig, signals);
    expect(candidates.filter((candidate) => candidate.opposeCount).map((candidate) => candidate.number)).toEqual([49]);
    expect(candidates.filter((candidate) => candidate.supportCount)).toHaveLength(48);
    const backtest = runBacktest({ draws, rules: [chosen], config: defaultConfig });
    const historical = buildRuleSignalsFromBacktest({ rules: [chosen], calculationBacktest: backtest, currentIssue: "101" });
    expect(historical[0]).toMatchObject({ action: "exclude", targetType: "number", targets: [49] });
  });

  it("retains each original formula contribution and the full 1..49 statistics domain", () => {
    const rules = [rule(), rule({ id: "same-result", formula: "49" })];
    const report = buildFormulaSummaryReport({ draws, rules, config: defaultConfig });
    expect(report).toMatchObject({ enabledRuleCount: 2, formulaCount: 2, ignoredRuleCount: 0, skippedCount: 0 });
    expect(report.latestPeriod!.contributions).toHaveLength(2);
    expect(report.latestPeriod!.contributions.every((item) => item.action === "exclude" && item.targetType === "number")).toBe(true);
    const groups = buildFormulaSummaryGroups([report.latestPeriod!]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ action: "exclude", targetType: "number", totalCount: 2, items: [{ target: 49, count: 2 }] });
    expect(buildFormulaTargetDomain("number", defaultConfig).map((item) => item.target)).toEqual(Array.from({ length: 49 }, (_, index) => index + 1));
  });

  it("compares historical success against the correct 48/49 uniform reference", () => {
    const chosen = rule();
    const result = runBacktest({ draws, rules: [chosen], config: defaultConfig }).ruleResults[0];
    const effect = evaluateFormulaEffect({ rule: chosen, details: result.details, config: defaultConfig, draws });
    expect(effect).toMatchObject({ status: "available", sampleCount: 2, successes: 1, actualRate: 50, successLabel: "排除正确" });
    expect(effect.expectedRate).toBeCloseTo(48 / 49 * 100);
  });

  it("carries the exact excluded number and validation status into one-click results and detail ledgers", () => {
    const chosen = rule();
    const [oneClick] = buildOneClickFormulaResults({ draw: draws[2], rules: [chosen], config: defaultConfig });
    expect(oneClick).toMatchObject({ category: "kill_number", rawResult: 98, finalOutputLabel: "杀特码 49", outputDescription: "杀特码 49" });
    expect(oneClick.mappingLine).toContain("排除特码 49");
    expect(oneClick.error).toBeUndefined();
    const result = runBacktest({ draws, rules: [chosen], config: defaultConfig }).ruleResults[0];
    const ledger = buildFormulaLedger(result, { draws, config: defaultConfig });
    expect(ledger.entries.map((entry) => entry.statusText)).toEqual(["错误", "正确", "待验证"]);
    expect(ledger.entries.every((entry) => entry.finalOutputLabel === "杀特码 49")).toBe(true);
  });

  it("populates number landing, performance and duplicate/conflict diagnostics through the complete analysis report", () => {
    const chosen = rule();
    const history = Array.from({ length: 12 }, (_, index) => ({ ...draws[0], issue: String(101 + index), special: index % 2 ? 49 : 48 }));
    const report = buildFormulaAnalysisReport({
      draws: history, rules: [chosen, rule({ id: "also-exclude", formula: "49" }), rule({ id: "include", category: "custom_set", formula: "49" })],
      config: defaultConfig, window: 10, action: "exclude", targetType: "number", source: { label: "test" },
    });
    expect(report.dataHealth.formulaErrors).toEqual([]);
    expect(report.landing.domain).toHaveLength(49);
    expect(report.landing.records).toHaveLength(10);
    expect(report.landing.records.every((entry) => entry.count === (entry.specialNumber === 49 ? 2 : 0))).toBe(true);
    expect(report.health.rows.find((entry) => entry.ruleId === chosen.id)?.effect.expectedRate).toBeCloseTo(48 / 49 * 100);
    expect(report.pairs.duplicates).toEqual([expect.objectContaining({ targetType: "number", score: 1 })]);
    expect(report.pairs.conflicts).toHaveLength(2);
    expect(report.pairs.conflicts.every((pair) => pair.targetType === "number" && pair.score === 1)).toBe(true);
  });

  it("parses explicit kill-special text even when formula operands mention sums or colors", () => {
    const parsed = parseRuleTextFile("计算类型：杀特码\n公式：平1合+平2波色值\n号码顺序：D序", "杀特码.txt");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rules[0]).toMatchObject({ category: "kill_number", target: "special_number", normalizer: "subtract_49_to_1_49", orderMode: "D" });
  });

  it("exports the readable category name", () => {
    const html = buildRuleLibraryWordHtml([rule({ name: "测试公式" })]);
    expect(html).toContain("杀特码");
    expect(html).not.toContain("kill_number");
  });
});
