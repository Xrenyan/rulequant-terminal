import { describe, expect, it } from "vitest";

import seedDraws from "@/../data/sample-draws.json";
import { defaultConfig } from "@/lib/config/default-config";
import {
  FIXED_PATTERN_RULES,
  analyzeFixedPatternHistory,
  buildFixedPatternSignals,
  type FixedPatternAnalysisReport,
} from "@/lib/special-analysis/fixed-pattern-analysis";
import type { DrawRecord } from "@/types/domain";

function draw(issue: number, date: string, special: number): DrawRecord {
  const base = ((issue - 1) % 43) + 1;
  return {
    issue: String(2026000 + issue),
    date,
    n1: base,
    n2: ((base + 6) % 49) + 1,
    n3: ((base + 12) % 49) + 1,
    n4: ((base + 18) % 49) + 1,
    n5: ((base + 24) % 49) + 1,
    n6: ((base + 30) % 49) + 1,
    special,
  };
}

function fixtureDraws(count = 45): DrawRecord[] {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    return draw(index + 1, date, ((index * 11 + 6) % 49) + 1);
  });
}

describe("fixed pattern mappings", () => {
  it("encodes all supplied color and tail tables", () => {
    expect(FIXED_PATTERN_RULES.colorByPreviousZodiac.鼠.primary).toEqual(["红", "绿"]);
    expect(FIXED_PATTERN_RULES.colorByPreviousZodiac.羊).toEqual({
      primary: ["蓝"],
      secondary: ["红", "绿"],
    });
    expect(FIXED_PATTERN_RULES.colorByDayTable1[2]).toEqual(["红", "绿"]);
    expect(FIXED_PATTERN_RULES.colorByDayTable1[4]).toBeUndefined();
    expect(FIXED_PATTERN_RULES.colorByDayTable2[4]).toEqual(["绿", "红"]);
    expect(FIXED_PATTERN_RULES.tailsByPreviousSpecialTail[4]).toEqual([3, 4, 5, 0, 6, 7]);
    expect(FIXED_PATTERN_RULES.tailsByPreviousZodiac.鸡).toEqual([0, 2, 3, 5, 7, 8, 9]);
    expect(FIXED_PATTERN_RULES.tailsByDay[31]).toEqual([1, 3, 5, 7, 0, 2, 4, 8]);
  });

  it("builds source signals from previous special and target date", () => {
    const previous = draw(1, "2026-07-01", 7);
    const signals = buildFixedPatternSignals(previous, "2026-07-02", defaultConfig);
    const byId = new Map(signals.map((signal) => [signal.source.id, signal]));

    expect(byId.get("color_previous_zodiac")?.values.map((entry) => entry.value)).toEqual(["红", "绿"]);
    expect(byId.get("color_date_table_1")?.values.map((entry) => entry.value)).toEqual(["红", "绿"]);
    expect(byId.get("color_date_table_2")?.values.map((entry) => entry.value)).toEqual(["红", "绿"]);
    expect(byId.get("tail_previous_special")?.values.map((entry) => entry.value)).toEqual([2, 3, 4, 6, 7, 8]);
    expect(byId.get("tail_previous_zodiac")?.values.map((entry) => entry.value)).toEqual([1, 2, 3, 4, 5, 8, 9]);
    expect(byId.get("tail_date_table")?.values.map((entry) => entry.value)).toEqual([1, 3, 5, 9, 2, 4, 6, 8]);
  });
});

describe("fixed pattern rolling analysis", () => {
  it("runs against the complete bundled draw history without empty or invalid output", () => {
    const report = analyzeFixedPatternHistory(seedDraws as DrawRecord[], defaultConfig);
    const next = report.nextPrediction;

    expect(report.allRecords).toHaveLength(seedDraws.length - 1);
    expect(next?.basedOnIssue).toBe(seedDraws.at(-1)?.issue);
    expect(next?.top2Colors.every((candidate) => candidate.supportSources.length > 0)).toBe(true);
    expect(next?.top5Tails.every((candidate) => candidate.supportSources.length > 0)).toBe(true);
    expect(report.combinedBacktest.colorTop2.all.samples).toBe(seedDraws.length - 1);
    expect(report.combinedBacktest.tailTop5.all.samples).toBe(seedDraws.length - 1);
  });

  it("does not change an earlier prediction when future draws are appended", () => {
    const first = analyzeFixedPatternHistory(fixtureDraws(30), defaultConfig);
    const extended = analyzeFixedPatternHistory(fixtureDraws(45), defaultConfig);
    const issue = first.allRecords[20].issue;
    const firstRow = first.allRecords.find((row) => row.issue === issue);
    const extendedRow = extended.allRecords.find((row) => row.issue === issue);

    expect(extendedRow).toEqual(firstRow);
  });

  it("returns exact Top2, Top5 and Top7 counts with finite non-negative scoring", () => {
    const report = analyzeFixedPatternHistory(fixtureDraws(), defaultConfig, {
      nextDate: "2026-02-15",
    });
    const next = report.nextPrediction;

    expect(next).toBeDefined();
    expect(next?.top2Colors).toHaveLength(2);
    expect(next?.top5Tails).toHaveLength(5);
    expect(next?.top7Tails).toHaveLength(7);
    expect(new Set(next?.top2Colors.map((item) => item.value)).size).toBe(2);
    expect(new Set(next?.top5Tails.map((item) => item.value)).size).toBe(5);
    expect(new Set(next?.top7Tails.map((item) => item.value)).size).toBe(7);

    const candidates = [...(next?.top2Colors ?? []), ...(next?.top5Tails ?? []), ...(next?.top7Tails ?? [])];
    candidates.forEach((candidate) => {
      expect(Number.isFinite(candidate.score)).toBe(true);
      expect(Number.isFinite(candidate.probability)).toBe(true);
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.probability).toBeGreaterThanOrEqual(0);
      expect(candidate.probability).toBeLessThanOrEqual(100);
      candidate.supportSources.forEach((support) => {
        expect(Number.isFinite(support.learnedWeight)).toBe(true);
        expect(support.learnedWeight).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it("returns source, combined and recent rolling backtest structures", () => {
    const report: FixedPatternAnalysisReport = analyzeFixedPatternHistory(fixtureDraws(35), defaultConfig, {
      recentLimit: 12,
    });

    expect(report.allRecords).toHaveLength(34);
    expect(report.recentRecords).toHaveLength(12);
    expect(report.sourceSummaries).toHaveLength(6);
    expect(report.combinedBacktest.totalPeriods).toBe(34);
    expect(report.allRecords[0].previousIssue).toBe("2026001");
    expect(report.allRecords[0].sourcePredictions.length).toBeGreaterThanOrEqual(4);

    const statisticalGroups = [
      ...report.sourceSummaries.map((summary) => summary.historicalStats),
      report.combinedBacktest.colorTop2,
      report.combinedBacktest.tailTop5,
      report.combinedBacktest.tailTop7,
      ...(report.nextPrediction?.top2Colors.map((candidate) => candidate.historicalStats) ?? []),
    ];
    statisticalGroups.forEach((group) => {
      expect(group.all.samples).toBeGreaterThanOrEqual(0);
      expect(group.all.hits).toBeGreaterThanOrEqual(0);
      expect(group.all.rate).toBeGreaterThanOrEqual(0);
      expect(group.all.rate).toBeLessThanOrEqual(100);
      expect(group.last10.samples).toBeLessThanOrEqual(10);
      expect(group.last20.samples).toBeLessThanOrEqual(20);
      expect(group.last30.samples).toBeLessThanOrEqual(30);
    });
  });
});
