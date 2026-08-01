import { describe, expect, it } from "vitest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { runRuleCalculation } from "@/lib/rule-engine/rule-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";

describe("cleaned rule library import", () => {
  it("contains every unique exported formula with stable source counts", () => {
    expect(seedRules).toHaveLength(117);
    expect(seedRules.filter((rule) => rule.sourceType === "manual")).toHaveLength(57);
    expect(seedRules.filter((rule) => rule.sourceType === "user_provided")).toHaveLength(53);
    expect(seedRules.filter((rule) => rule.sourceType === "system_recommended")).toHaveLength(6);
    expect(seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260727-"))).toHaveLength(14);
    expect(seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260729-"))).toHaveLength(25);
    expect(new Set(seedRules.map((rule) => rule.id)).size).toBe(seedRules.length);
  });

  it("keeps the latest corrected formulas from the 116-rule archive", () => {
    expect(seedRules.find((rule) => rule.id === "rq-kill-tail-d-core")?.formula).toBe(
      "6+平1五行值 + 平4 + 特码尾 + 总数尾",
    );
    expect(seedRules.find((rule) => rule.id === "rq-manual-html-20260716-055")).toMatchObject({
      orderMode: "L",
      formula: "平2尾+平3合尾+特码合+特码五行值",
    });
    expect(seedRules.find((rule) => rule.id === "rq-system-html-20260716-067")?.formula).toBe(
      "4+平1段+平3头+总数尾 + 期尾",
    );
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
