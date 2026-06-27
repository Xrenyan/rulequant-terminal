import { describe, expect, test } from "vitest";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";

describe("seed rules", () => {
  test("all bundled rules can run through the backtest engine", () => {
    const result = runBacktest({ draws: seedDraws, rules: seedRules, config: seedConfig });

    expect(result.ruleResults).toHaveLength(seedRules.length);
    expect(result.ruleResults.every((item) => item.details.length > 0)).toBe(true);
  });
});
