import { describe, expect, it } from "vitest";
import staticCloudState from "../public/static-cloud-state.json";
import { seedRules } from "@/lib/data/seed";

describe("published static rule state", () => {
  it("ships every latest bundled formula and retires replaced seed formulas", () => {
    const publishedById = new Map(staticCloudState.rules.map((rule) => [rule.id, rule]));

    expect(publishedById.has("rq-kill-element-l-core")).toBe(false);
    seedRules.forEach((rule) => {
      expect(publishedById.get(rule.id)).toMatchObject({
        name: rule.name,
        formula: rule.formula,
        category: rule.category,
        orderMode: rule.orderMode,
        enabled: rule.enabled,
      });
    });
  });
});
