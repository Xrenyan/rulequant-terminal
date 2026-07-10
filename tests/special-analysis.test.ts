import { describe, expect, it } from "vitest";
import { analyzeBinaryTrend, analyzeSpecialRule } from "@/lib/special-analysis/special-analysis";
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

describe("special rule analysis", () => {
  it("calculates kill-color through the shared formula engine and checks the next special", () => {
    const report = analyzeSpecialRule("kill-color", [first, { ...first, issue: "2026002", special: 5 }], seedConfig);
    const detail = report.details[0];

    expect(detail.variables).toMatchObject({
      平1: 4,
      平2五行值: 1,
      平4头: 0,
      平4波色值: 2,
      平5段: 4,
      特尾: 0,
    });
    expect(detail.rawResult).toBe(11);
    expect(detail.normalizedValue).toBe(2);
    expect(detail.targetLabels).toEqual(["绿波"]);
    expect(detail.success).toBe(false);
  });

  it("normalizes kill-door to 1-5 and uses the fixed door table", () => {
    const report = analyzeSpecialRule("kill-door", [first, { ...first, issue: "2026002", special: 5 }], seedConfig);
    const detail = report.details[0];

    expect(detail.rawResult).toBe(11);
    expect(detail.normalizerSteps).toEqual([11, 6, 1]);
    expect(detail.normalizedValue).toBe(1);
    expect(detail.targetNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(detail.success).toBe(false);
  });

  it("does not silently score the duplicated half-head mapping for result 6", () => {
    const draw = { ...first, n2: 11, n3: 12, n6: 20, special: 10 };
    const report = analyzeSpecialRule("half-head-l", [draw, { ...first, issue: "2026002", special: 30 }], seedConfig);
    const detail = report.details[0];

    expect(detail.normalizedValue).toBe(6);
    expect(detail.targetLabels).toEqual(["3头单", "2头双"]);
    expect(detail.ambiguous).toBe(true);
    expect(detail.success).toBeUndefined();
    expect(report.ambiguousCount).toBe(1);
    expect(report.scenarios).toHaveLength(2);
  });

  it("produces bounded size and parity probabilities with walk-forward evidence", () => {
    const size = analyzeBinaryTrend(seedDraws, "size");
    const parity = analyzeBinaryTrend(seedDraws, "parity");

    expect(size.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(100, 1);
    expect(parity.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(100, 1);
    expect(size.backtestRate).toBeGreaterThanOrEqual(0);
    expect(size.backtestRate).toBeLessThanOrEqual(100);
    expect(size.sequence20.length).toBeLessThanOrEqual(20);
  });

  it("matches the D-order seven-tail example for base tail 8", () => {
    const draw: DrawRecord = {
      issue: "2026161",
      n1: 49,
      n2: 40,
      n3: 30,
      n4: 20,
      n5: 10,
      n6: 1,
      special: 11,
    };
    const report = analyzeSpecialRule("seven-tail-d", [draw], seedConfig);
    const detail = report.details[0];

    expect(detail.rawResult).toBe(8);
    expect(detail.normalizedValue).toBe(8);
    expect(detail.targetLabels).toEqual(["七尾 4、5、7、9、1、2、3"]);
  });

  it("normalizes the D-order kill-element formula to the configured five elements", () => {
    const report = analyzeSpecialRule("kill-element-d", [first, { ...first, issue: "2026002", special: 8 }], seedConfig);
    const detail = report.details[0];

    expect(detail.rawResult).toBe(12);
    expect(detail.normalizerSteps).toEqual([12, 7, 2]);
    expect(detail.targetLabels).toEqual(["木行"]);
    expect(detail.success).toBe(false);
  });
});
