import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import staticCloudState from "../public/static-cloud-state.json";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";

const sourceLines = readFileSync(new URL("../docs/raw-rules/2026-09-26-kill-number-189-218.txt", import.meta.url), "utf8")
  .replace(/^\uFEFF/, "").trim().split(/\r?\n/);
const originalFormulas = sourceLines.slice(1);
const ids = Array.from({ length: 30 }, (_, index) => `rq-user-20260926-kill-number-${189 + index}`);
const idSet = new Set(ids);
const addedRules = seedRules.filter((rule) => idSet.has(rule.id));

// Artificial hand-check fixture, not an actual draw or a claim about historic accuracy.
// L order is [10,20,30,40,25,35], special 36; sum 196, digit sum 16, sum digit-tail 6.
// Issue 268 -> tens digit 6 and last digit 8. L order must NOT silently become sorted D order.
// Fixed zodiac positions: 10鸡=10,20猪=12,30牛=2,40兔=4,25马=7,35猴=9,36羊=8.
// Element values: 10火=4,20土=5,30水=3,40火=4,25木=2,35金=1,36土=5.
// Color values: 10蓝=1,20蓝=1,30红=0,40红=0,25蓝=1,35红=0,36蓝=1.
const current = normalizeDraw({ issue: "2026268", n1: 10, n2: 20, n3: 30, n4: 40, n5: 25, n6: 35, special: 36 }, defaultConfig);

describe("新增30条49-L序杀号公式：189—218", () => {
  it("完整保留原文30行顺序，种子库与静态快照只各增加一份对应公式", () => {
    expect(sourceLines[0]).toBe("杀号公式-49L序");
    expect(originalFormulas).toHaveLength(30);
    expect(originalFormulas[0]).toBe("6+平1码+平2段+平4段");
    expect(originalFormulas.at(-1)).toBe("20+特码+总数合+特波+总数合尾");
    expect(new Set(originalFormulas).size).toBe(30);
    expect(addedRules.map((rule) => rule.id)).toEqual(ids);
    expect(addedRules.map((rule) => rule.formula)).toEqual(originalFormulas);
    expect(staticCloudState.rules.filter((rule) => idSet.has(rule.id))).toEqual(addedRules);
    expect(new Set(seedRules.map((rule) => rule.id)).size).toBe(seedRules.length);
    expect(new Set(staticCloudState.rules.map((rule) => rule.id)).size).toBe(staticCloudState.rules.length);

    for (let index = 0; index < addedRules.length; index += 1) {
      expect(addedRules[index]).toMatchObject({
        id: ids[index], name: `L序杀特码-${189 + index}`, formula: originalFormulas[index],
        category: "kill_number", orderMode: "L", normalizer: "subtract_49_to_1_49", target: "special_number",
        verifyMode: "next_special", verifyOffset: 1, periodSpan: 1, enabled: true, participatesInReference: true,
        sourceType: "user_provided", canCompute: true, parseStatus: "parsed",
      });
    }
  });

  it("没有与原公式库或这30条内部重复的计算签名", () => {
    const bySignature = new Map<string, string[]>();
    for (const rule of seedRules) {
      const signature = buildRuleSignature(rule);
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), rule.id]);
    }
    expect(addedRules).toHaveLength(30);
    for (const rule of addedRules) expect(bySignature.get(buildRuleSignature(rule)), rule.id).toEqual([rule.id]);
  });

  it("不把手算测试或来源文字伪装成真实统计与人工核验", () => {
    expect(addedRules).toHaveLength(30);
    for (const rule of addedRules) {
      expect(rule.manuallyConfirmed).toBe(false);
      expect(rule.verifyStatus).toBe("no_sample");
      expect(rule.examples).toEqual([]);
      for (const field of ["total", "success", "failed", "successRate", "hitRate", "currentStreak", "maxStreak", "performance"]) {
        expect(rule, rule.id).not.toHaveProperty(field);
      }
    }
  });

  it("全部现有历史每一期只排除1个1—49号码，按下一期实际特码判定", () => {
    const result = runBacktest({ draws: seedDraws, rules: addedRules, config: seedConfig, cache: false });
    expect(result.ruleResults).toHaveLength(30);
    expect(seedDraws.length).toBeGreaterThan(1);
    for (const ruleResult of result.ruleResults) {
      expect(ruleResult.error, ruleResult.rule.id).toBeUndefined();
      expect(ruleResult.total).toBe(seedDraws.length - 1);
      expect(ruleResult.details).toHaveLength(seedDraws.length - 1);
      for (const detail of ruleResult.details) {
        const context = `${ruleResult.rule.id} / ${detail.currentIssue}`;
        expect(Number.isSafeInteger(detail.rawResult), context).toBe(true);
        expect(detail.rawResult, context).toBeGreaterThan(0);
        // Independent arithmetic rule: repeatedly subtract 49 only while over 49; 49 stays 49.
        let expected = detail.rawResult;
        while (expected > 49) expected -= 49;
        expect(detail.finalResult, context).toBe(expected);
        expect(detail.mappedResult, context).toEqual([expected]);
        expect(expected, context).toBeGreaterThanOrEqual(1);
        expect(expected, context).toBeLessThanOrEqual(49);
        expect(detail.futureChecks, context).toHaveLength(1);
        expect(detail.nextIssue, context).toBe(detail.futureChecks[0].issue);
        expect(detail.success, context).toBe(detail.futureChecks[0].special !== expected);
      }
    }
  });

  it.each([
    [189, [6, 10, 3, 6], 25, 25],
    [190, [61, 2, 4, 1, 9, 0, 25], 102, 4],
    [191, [67, 2, 3, 5, 5, 0], 82, 33],
    [192, [20, 0, 3, 2, 0, 3, 7], 35, 35],
    [193, [86, 5, 0, 9], 100, 2],
    [194, [41, 35, 3, 6], 85, 36],
    [195, [15, 1, 6, 7, 9], 38, 38],
    [196, [12, 35, 0, 1, 40, 2], 90, 41],
    [197, [48, 1, 0, 6, 4, 0, 2], 61, 12],
    [198, [1, 3, 3, 2], 9, 9],
    [199, [64, 3, 3, 1, 9, 2, 8], 90, 41],
    [200, [62, 7, 6, 10, 7, 3], 95, 46],
    [201, [4, 9, 25, 4, 3, 3, 4], 52, 3],
    [202, [75, 3, 6, 36, 6, 3], 129, 31],
    [203, [20, 4, 4, 3, 8], 39, 39],
    [204, [73, 0, 1, 6, 2, 1], 83, 34],
    [205, [16, 9, 9, 25, 8, 4, 8], 79, 30],
    [206, [81, 1, 1, 0, 2, 36], 121, 23],
    [207, [69, 2, 3, 0], 74, 25],
    [208, [71, 16, 3, 6], 96, 47],
    [209, [26, 4, 3, 2], 35, 35],
    [210, [41, 10, 40, 10], 101, 3],
    [211, [44, 0, 6, 9, 25, 1, 9], 94, 45],
    [212, [12, 2, 2, 3, 1, 2, 7], 29, 29],
    [213, [69, 6, 4, 1, 16, 2, 8], 106, 8],
    [214, [45, 0, 8, 9, 1, 4], 67, 18],
    [215, [46, 4, 12, 1, 3, 8], 74, 25],
    [216, [61, 196, 4, 3], 264, 19],
    [217, [63, 3, 1, 4, 7, 4], 82, 33],
    [218, [20, 36, 16, 1, 6], 79, 30],
  ] as const)("第%s条固定样例的每项取值、总和及减49结果与独立手算一致", (number, expectedTerms, expectedRaw, expectedNumber) => {
    const rule = addedRules.find((item) => item.id === `rq-user-20260926-kill-number-${number}`);
    expect(rule).toBeDefined();
    const result = calculateRule(rule!, current, defaultConfig, { cache: false });
    const actualTerms = rule!.formula.split("+").map((token) => /^\d+$/.test(token) ? Number(token) : result.variables[token]);
    expect(actualTerms).toEqual(expectedTerms);
    expect(expectedTerms.reduce<number>((total, term) => total + term, 0)).toBe(expectedRaw);
    expect(result.rawResult).toBe(expectedRaw);
    expect(result.finalResult).toBe(expectedNumber);
    expect(result.mappedResult).toEqual([expectedNumber]);
    expect(result.normalizerSteps.at(-1)).toBe(expectedNumber);
  });
});
