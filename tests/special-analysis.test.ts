import { describe, expect, it } from "vitest";
import { analyzeBinaryTrend, analyzeHistoricalNineGrid } from "@/lib/special-analysis/special-analysis";
import { seedConfig, seedDraws } from "@/lib/data/seed";
import type { DrawRecord } from "@/types/domain";

const first: DrawRecord = {
  issue: "2026001",
  n1: 4,
  n2: 12,
  n3: 13,
  n4: 5,
  n5: 22,
  n6: 29,
  special: 10,
};

describe("special analysis", () => {
  it("uses the latest special number as anchor and searches earlier 3x3 history", () => {
    const draws: DrawRecord[] = [
      { ...first, issue: "2026001", n1: 1, n2: 2, n3: 3, special: 11 },
      { ...first, issue: "2026002", n1: 25, n2: 4, n3: 5, special: 12 },
      { ...first, issue: "2026003", n1: 6, n2: 7, n3: 8, special: 13 },
      { ...first, issue: "2026004", n1: 25, n2: 9, n3: 10, special: 25 },
    ];
    const report = analyzeHistoricalNineGrid(draws, seedConfig, "number");
    expect(report?.anchorIssue).toBe("2026004");
    expect(report?.anchorNumber).toBe(25);
    expect(report?.occurrences).toHaveLength(1);
    expect(report?.occurrences[0].issue).toBe("2026002");
    expect(report?.occurrences[0].columnIndexes).toEqual([0, 1, 2]);
    expect(report?.occurrences[0].cells).toHaveLength(9);
    expect(report?.occurrences[0].cells.filter((cell) => cell.isAnchor)).toHaveLength(1);
  });

  it("searches every historical zodiac position and clamps right-edge grids", () => {
    const horseNumber = seedConfig.zodiacTable["马"][0];
    const draws: DrawRecord[] = [
      { ...first, issue: "2026001", special: 11 },
      { ...first, issue: "2026002", n6: horseNumber, special: 12 },
      { ...first, issue: "2026003", special: 13 },
      { ...first, issue: "2026004", special: 25 },
    ];
    const report = analyzeHistoricalNineGrid(draws, seedConfig, "zodiac");
    const occurrence = report?.occurrences.find((item) => item.issue === "2026002" && item.positionIndex === 5);
    expect(report?.anchorZodiac).toBe("马");
    expect(occurrence?.columnIndexes).toEqual([4, 5, 6]);
    expect(report?.rankings).toHaveLength(12);
  });

  it("produces ranked number and zodiac sets with walk-forward evidence", () => {
    const numberReport = analyzeHistoricalNineGrid(seedDraws, seedConfig, "number");
    const zodiacReport = analyzeHistoricalNineGrid(seedDraws, seedConfig, "zodiac");
    expect(numberReport?.rankings).toHaveLength(49);
    expect(zodiacReport?.rankings).toHaveLength(12);
    expect(numberReport?.overallBacktest.total).toBeGreaterThan(0);
    expect(numberReport?.overallBacktest.topRates.map((item) => item.top)).toEqual([8, 12, 18]);
    expect(zodiacReport?.overallBacktest.topRates.map((item) => item.top)).toEqual([7, 8, 9]);
  });

  it("produces bounded size and parity probabilities with walk-forward evidence", () => {
    const size = analyzeBinaryTrend(seedDraws, "size");
    const parity = analyzeBinaryTrend(seedDraws, "parity");
    expect(size.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(100, 1);
    expect(parity.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(100, 1);
    expect(size.backtestRate).toBeGreaterThanOrEqual(0);
    expect(size.backtestRate).toBeLessThanOrEqual(100);
    expect(size.sequence20.length).toBeLessThanOrEqual(20);
    expect(size.modelWeights.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(100, 0);
  });

  it("learns different probabilities when recent patterns change", () => {
    const alternating = Array.from({ length: 40 }, (_, index): DrawRecord => ({ ...first, issue: `2026${String(index + 1).padStart(3, "0")}`, special: index % 2 === 0 ? 40 : 10 }));
    const streaking = alternating.map((draw, index) => ({ ...draw, special: index >= 30 ? 40 : draw.special }));
    expect(analyzeBinaryTrend(alternating, "size").probabilities).not.toEqual(analyzeBinaryTrend(streaking, "size").probabilities);
    expect(analyzeBinaryTrend(streaking, "size").currentStreak).toBe(10);
  });
});
