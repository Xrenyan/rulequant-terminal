import { describe, expect, it } from "vitest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { runRuleCalculation } from "@/lib/rule-engine/rule-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";

describe("cleaned rule library import", () => {
  it("contains every unique exported formula with stable source counts", () => {
    expect(seedRules).toHaveLength(92);
    expect(seedRules.filter((rule) => rule.sourceType === "manual")).toHaveLength(33);
    expect(seedRules.filter((rule) => rule.sourceType === "system_recommended")).toHaveLength(6);
    expect(seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260727-"))).toHaveLength(14);
    expect(new Set(seedRules.map((rule) => rule.id)).size).toBe(seedRules.length);
  });

  it("can calculate every imported formula against the latest bundled draw", () => {
    const latest = normalizeDraw(seedDraws.at(-1)!, seedConfig);
    const failures = seedRules.flatMap((rule) => {
      try {
        const calculation = runRuleCalculation(rule, latest, seedConfig);
        return Number.isFinite(calculation.rawResult) && calculation.mappedResult.length > 0
          ? []
          : [`${rule.name}: 结果为空`];
      } catch (error) {
        return [`${rule.name}: ${error instanceof Error ? error.message : String(error)}`];
      }
    });

    expect(failures).toEqual([]);
  });

  it("contains no duplicate calculation signatures after data cleaning", () => {
    const groups = new Map<string, string[]>();
    seedRules.forEach((rule) => {
      const signature = buildRuleSignature(rule);
      groups.set(signature, [...(groups.get(signature) ?? []), rule.name]);
    });
    const duplicates = [...groups.values()].filter((names) => names.length > 1);

    expect(duplicates).toEqual([]);
  });
});
