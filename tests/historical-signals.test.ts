import { describe, expect, it } from "vitest";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { buildRuleSignals, buildRuleSignalsFromBacktest } from "@/lib/signal-system/signal-system";

describe("historical recommendation signals", () => {
  it("reuses stored calculation details without changing the recommendation evidence", () => {
    const rules = seedRules.slice(0, 12).map((rule) => ({ ...rule, manuallyConfirmed: true }));
    const draws = seedDraws.slice(-40);
    const previousDraw = draws.at(-2)!;
    const previousIndex = draws.length - 2;
    const historicalDraws = draws.slice(0, -1);
    const historicalBacktest = runBacktest({ draws: historicalDraws, rules, config: seedConfig });
    const fullBacktest = runBacktest({ draws, rules, config: seedConfig });

    const calculatedSignals = buildRuleSignals({ draws: historicalDraws, rules, config: seedConfig, backtest: historicalBacktest });
    const reusedSignals = buildRuleSignalsFromBacktest({
      rules,
      backtest: historicalBacktest,
      calculationBacktest: fullBacktest,
      currentIssue: previousDraw.issue,
      fallbackCurrent: normalizeDraw(previousDraw, seedConfig),
      fallbackConfig: seedConfig,
      fallbackPeriodIndex: previousIndex,
    });

    expect(reusedSignals).toEqual(calculatedSignals);
  });
});
