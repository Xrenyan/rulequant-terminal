import { describe, expect, it } from "vitest";
import { clearFormulaDiscoveryCache, discoverFormulaCandidates, getFormulaDiscoveryCacheSize } from "@/lib/formula-discovery/formula-discovery";
import { seedConfig, seedDraws } from "@/lib/data/seed";
import type { RuleCategory } from "@/types/domain";

describe("formula discovery", () => {
  it("caches identical discovery runs", () => {
    clearFormulaDiscoveryCache();
    const input = {
      draws: seedDraws,
      config: seedConfig,
      limit: 6,
      categories: ["kill_tail", "kill_zodiac"] satisfies RuleCategory[],
      variablePool: ["尾(平1)", "段(平2)", "特码合", "期尾"],
      maxTerms: 3,
    };

    discoverFormulaCandidates(input);
    discoverFormulaCandidates(input);

    expect(getFormulaDiscoveryCacheSize()).toBe(1);
  });

  it("generates addable formulas from historical data and ranks them by performance", () => {
    const candidates = discoverFormulaCandidates({
      draws: seedDraws,
      config: seedConfig,
      limit: 8,
      categories: ["kill_tail", "kill_zodiac"],
      variablePool: ["尾(平1)", "段(平2)", "特码合", "期尾"],
      maxTerms: 3,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toMatchObject({
      rule: expect.objectContaining({
        id: expect.stringContaining("auto-"),
        formula: expect.any(String),
        enabled: false,
      }),
      trainingRate: expect.any(Number),
      validationRate: expect.any(Number),
      holdoutRate: expect.any(Number),
      recentRate: expect.any(Number),
      complexity: expect.any(Number),
      stabilityGap: expect.any(Number),
      trainingResult: expect.objectContaining({ total: expect.any(Number) }),
      validationResult: expect.objectContaining({ total: expect.any(Number) }),
      holdoutResult: expect.objectContaining({ total: expect.any(Number) }),
      total: expect.any(Number),
      successRate: expect.any(Number),
      currentStreak: expect.any(Number),
      failedIssues: expect.any(Array),
    });
    expect(candidates[0].rule.formula.split("+").length).toBeLessThanOrEqual(3);
    expect(candidates[0].validationResult.total).toBeGreaterThan(0);
    expect(candidates[0].holdoutResult.total).toBeGreaterThan(0);
    expect(candidates[0].validationRate + 25).toBeGreaterThanOrEqual(candidates[0].trainingRate);
  });

  it("runs every requested formula depth and supports D-order candidates", () => {
    const candidates = discoverFormulaCandidates({
      draws: seedDraws,
      config: seedConfig,
      limit: 18,
      categories: ["kill_tail"],
      variablePool: ["平1尾", "平2尾", "平3合", "特码合", "期尾"],
      maxTerms: 4,
      orderModes: ["D"],
      formulaStyles: ["sum", "alternating"],
      combinationLimitPerTerm: 20,
      minTrainingRate: 0,
      minValidationRate: 0,
      minHoldoutRate: 0,
      minRecentRate: 0,
      maxTrainValidationGap: 100,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.rule.orderMode === "D")).toBe(true);
    expect(new Set(candidates.map((candidate) => candidate.complexity))).toEqual(new Set([2, 3, 4]));
    expect(candidates.every((candidate) => candidate.holdoutResult.total > 0)).toBe(true);
  });
});
