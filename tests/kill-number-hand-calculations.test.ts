import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule } from "@/lib/formula-engine/formula-engine";

// Constructed arithmetic check, NOT a claimed actual draw or historical performance sample.
// L:10,20,30,40,25,35; D:10,20,25,30,35,40; special36; total196; issue268.
const current = normalizeDraw({ issue: "2026268", n1: 10, n2: 20, n3: 30, n4: 40, n5: 25, n6: 35, special: 36 }, defaultConfig);

describe("12条杀特码的独立手算核对", () => {
  it.each([
    [177, [5, 0, 9, 4, 6, 196, 11], 231, 35],
    [178, [5, 3, 4, 0, 2, 8, 38], 60, 11],
    [179, [1, 1, 6, 35, 29], 72, 23],
    [180, [4, 9, 7, 18], 38, 38],
    [181, [0, 35, 27], 62, 13],
    [182, [6, 4, 4, 18], 32, 32],
    [183, [2, 1, 2, 4, 6, 11], 26, 26],
    [184, [7, 4, 0, 4, 5, 9, 20, 8, 6], 63, 14],
    [185, [4, 2, 0, 1, 4, 16, 8], 35, 35],
    [186, [1, 1, 0, 7, 6, 9, 36, 25, 268, 9, 40], 402, 10],
    [187, [3, 4, 2, 268, 23], 300, 6],
    [188, [3, 1, 5, 12, 20, 8, 37], 86, 37],
  ] as const)("第%s条每项数值、总值和减49结果一致", (id, terms, raw, target) => {
    const rule = seedRules.find((item) => item.id === `rq-user-20260926-kill-number-${id}`)!;
    expect(rule).toBeDefined();
    const result = calculateRule(rule, current, defaultConfig, { cache: false });
    const inputs = rule.formula.split("+").map((token) => /^\d+$/.test(token) ? Number(token) : result.variables[token]);
    expect(inputs).toEqual(terms);
    expect(result.rawResult).toBe(raw);
    expect(result.finalResult).toBe(target);
    expect(result.mappedResult).toEqual([target]);
    expect(result.normalizerSteps.at(-1)).toBe(target);
  });
});
