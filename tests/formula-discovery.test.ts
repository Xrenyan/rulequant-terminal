import { describe, expect, it } from "vitest";
import { discoverFormulaCandidates } from "@/lib/formula-discovery/formula-discovery";
import { seedConfig, seedDraws } from "@/lib/data/seed";

describe("formula discovery", () => {
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
      trainingResult: expect.objectContaining({ total: expect.any(Number) }),
      validationResult: expect.objectContaining({ total: expect.any(Number) }),
      total: expect.any(Number),
      successRate: expect.any(Number),
      currentStreak: expect.any(Number),
      failedIssues: expect.any(Array),
    });
    expect(candidates[0].rule.formula.split("+").length).toBeLessThanOrEqual(3);
    expect(candidates[0].validationResult.total).toBeGreaterThan(0);
    expect(candidates[0].validationRate + 25).toBeGreaterThanOrEqual(candidates[0].trainingRate);
  });
});
