import { describe, expect, it } from "vitest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { runRuleCalculation } from "@/lib/rule-engine/rule-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";

describe("cleaned rule library import", () => {
  it("contains every unique exported formula with stable source counts", () => {
    expect(seedRules).toHaveLength(160);
    expect(seedRules.filter((rule) => rule.sourceType === "manual")).toHaveLength(99);
    expect(seedRules.filter((rule) => rule.sourceType === "user_provided")).toHaveLength(53);
    expect(seedRules.filter((rule) => rule.sourceType === "system_recommended")).toHaveLength(8);
    expect(seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260727-"))).toHaveLength(14);
    expect(seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260729-"))).toHaveLength(25);
    expect(seedRules.filter((rule) => rule.id.startsWith("rq-docx-20260816-"))).toHaveLength(44);
    expect(new Set(seedRules.map((rule) => rule.id)).size).toBe(seedRules.length);
  });

  it("bundles the latest formulas exported on 2026-08-16", () => {
    expect(seedRules.some((rule) => rule.name === "L序杀一行 - 样例核心")).toBe(false);
    expect(seedRules.find((rule) => rule.name === "D序杀一行 - 样例核心")?.formula).toBe(
      "行(平1) + 尾(平2) + 特码行 + 期尾",
    );
    expect(seedRules.find((rule) => rule.name === "D序杀一肖-2026.08.16新增自创1")).toMatchObject({
      orderMode: "D",
      formula: "平2波+平3波+平5波+7",
      enabled: true,
      participatesInReference: true,
    });
    expect(seedRules.find((rule) => rule.name === "L序杀一肖-2026.08.16新增自创2")?.formula).toBe(
      "平2波+平3波+平5波+5",
    );
    expect(seedRules.find((rule) => rule.name === "L序杀一肖-2026.08.16年规新增")?.formula).toBe(
      "平1码+平3肖位+平3合+特码+5",
    );
    expect(seedRules.find((rule) => rule.name === "自动筛选 30020（已加入）")).toMatchObject({
      category: "kill_tail",
      formula: "平4头 + 平5段 + 期尾",
      normalizer: "mod_10",
      target: "special_tail",
    });
    expect(seedRules.find((rule) => rule.name === "自动筛选 20018（已加入）")).toMatchObject({
      category: "kill_element",
      formula: "平4波色值 + 平6尾",
      normalizer: "subtract_5_to_1_5",
      target: "special_element",
    });
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
