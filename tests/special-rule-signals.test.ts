import { describe, expect, it } from "vitest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { buildRuleSignals } from "@/lib/signal-system/signal-system";

describe("special rules in the unified signal pipeline", () => {
  it("emits real exclusion evidence for every newly migrated rule", () => {
    const ids = ["rq-half-head-l-user", "rq-half-head-d-user", "rq-kill-color-l-user", "rq-kill-door-l-user"];
    const rules = seedRules.filter((rule) => ids.includes(rule.id));
    const signals = buildRuleSignals({ draws: seedDraws, rules, config: seedConfig });

    expect(rules).toHaveLength(4);
    expect(signals).toHaveLength(4);
    expect(signals.every((signal) => signal.action === "exclude" && signal.targets.length > 0)).toBe(true);
    expect(signals.find((signal) => signal.ruleId === "rq-kill-color-l-user")?.targetType).toBe("color");
    expect(signals.filter((signal) => signal.ruleId !== "rq-kill-color-l-user").every((signal) => signal.targetType === "number")).toBe(true);
  });
});
