import { describe, expect, test } from "vitest";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedDraws, seedRules } from "@/lib/data/seed";

describe("seed rule calculation coverage", () => {
  test("every seeded TXT formula can be calculated by the engine", () => {
    const result = runBacktest({ draws: seedDraws, rules: seedRules, config: defaultConfig });
    const failures = result.ruleResults
      .filter((ruleResult) => ruleResult.error || ruleResult.total === 0)
      .map((ruleResult) => `${ruleResult.rule.id}: ${ruleResult.error ?? "no details"}`);

    expect(failures).toEqual([]);
  });
});
