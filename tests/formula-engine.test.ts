import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { evaluateFormula } from "@/lib/formula/evaluate";
import { calculateRule, clearFormulaEngineCache, getFormulaEngineCacheSize } from "@/lib/formula-engine/formula-engine";
import { normalizeDraw } from "@/lib/engine/attributes";
import type { RuleRecord } from "@/types/domain";

const draw = normalizeDraw(
  {
    issue: "2026156",
    n1: 13,
    n2: 28,
    n3: 7,
    n4: 41,
    n5: 2,
    n6: 36,
    special: 19,
  },
  defaultConfig,
);

describe("formula engine", () => {
  test("resolves Chinese position variables from L order", () => {
    const result = evaluateFormula("平1 + 平2 + 特码尾 + 总数尾", draw, defaultConfig, "L");

    expect(result.value).toBe(56);
    expect(result.variables).toMatchObject({
      平1: 13,
      平2: 28,
      特码尾: 9,
      总数尾: 6,
    });
  });

  test("resolves Chinese position variables from D order", () => {
    const result = evaluateFormula("平1 + 平2 + 平7", draw, defaultConfig, "D");

    expect(result.value).toBe(28);
    expect(result.variables).toMatchObject({
      平1: 2,
      平2: 7,
      平7: 19,
    });
  });

  test("keeps special independent when D order sorts only six regular numbers", () => {
    const result = evaluateFormula("平6 + 平7 + 特码", draw, defaultConfig, "D");

    expect(result.value).toBe(79);
    expect(result.variables).toMatchObject({
      平6: 41,
      平7: 19,
      特码: 19,
    });
  });

  test("supports attribute calls and synonyms", () => {
    const result = evaluateFormula("尾(平1) + 合(平2) + 行(特码) + 波(特码)", draw, defaultConfig, "L");

    expect(result.value).toBe(17);
    expect(result.variables).toMatchObject({
      "尾(平1)": 3,
      "合(平2)": 10,
      "行(特码)": 4,
      "波(特码)": 0,
    });
  });

  test("supports raw rule suffix variables from uploaded formula text", () => {
    const result = evaluateFormula("平5合尾 + 平4头 + 平6合 + 平4 + 平6 + 9", draw, defaultConfig, "D");

    expect(result.value).toBe(94);
    expect(result.variables).toMatchObject({
      平5合尾: 9,
      平4头: 2,
      平6合: 5,
      平4: 28,
      平6: 41,
    });
  });

  test("supports shorthand special attributes from uploaded formula text", () => {
    const result = evaluateFormula("5 + 平2合 + 平3行 + 平5头 + 特合", draw, defaultConfig, "L");

    expect(result.value).toBe(30);
    expect(result.variables).toMatchObject({
      平2合: 10,
      平3行: 5,
      平5头: 0,
      特合: 10,
    });
  });

  test("supports sum-tail aliases, Chinese positions, color values and head parity", () => {
    const result = evaluateFormula("平一合数尾 + 落二波色值 + 平五头双 + 特码合数尾", draw, defaultConfig, "L");

    expect(result.value).toBe(7);
    expect(result.variables).toMatchObject({
      平一合数尾: 4,
      落二波色值: 2,
      平五头双: 1,
      特码合数尾: 0,
    });
  });

  test("treats 期号尾 as the standard issue tail variable", () => {
    const result = evaluateFormula("期号尾 + 期数尾 + 期合 + 期合尾", draw, defaultConfig, "L");

    expect(result.value).toBe(26);
    expect(result.variables).toMatchObject({
      期号尾: 6,
      期数尾: 6,
      期合: 12,
      期合尾: 2,
    });
  });

  test("calculates issue sum from the last three issue digits", () => {
    const issue174 = normalizeDraw({ issue: "2026174", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 }, defaultConfig);
    const result = evaluateFormula("期数 + 期合 + 期合尾", issue174, defaultConfig, "L");

    expect(result.variables).toMatchObject({
      期数: 174,
      期合: 12,
      期合尾: 2,
    });
    expect(result.value).toBe(188);
  });

  test("calculates odd-even 4455 rule from the current period position", () => {
    const rule: RuleRecord = {
      id: "test-parity-4455",
      name: "单双自用 - 取值4455",
      category: "include_parity",
      orderMode: "L",
      formula: "平4",
      normalizer: "parity_4455_plus_1_or_2",
      target: "special_parity",
      verifyMode: "next_special",
      positionPattern: [4, 4, 5, 5],
      anchorIssue: "2026172",
      anchorPatternIndex: 0,
      positionMeaning: "取值4455",
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "单双自用、、20260625、、取值4455(1).txt",
      examples: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    };

    const issue175 = normalizeDraw({ issue: "2026175", n1: 7, n2: 19, n3: 30, n4: 29, n5: 28, n6: 25, special: 26 }, defaultConfig);
    const issue173 = normalizeDraw({ issue: "2026173", n1: 2, n2: 1, n3: 42, n4: 40, n5: 7, n6: 10, special: 26 }, defaultConfig);
    const result175 = calculateRule(rule, issue175, defaultConfig, { periodIndex: 174 });
    const result173 = calculateRule(rule, issue173, defaultConfig, { periodIndex: 172 });

    expect(result175.expression).toBe("平5");
    expect(result175.rawResult).toBe(28);
    expect(result175.finalResult).toBe(30);
    expect(result175.mappedResult).toEqual(["双"]);
    expect(result173.expression).toBe("平4");
    expect(result173.rawResult).toBe(40);
    expect(result173.finalResult).toBe(41);
    expect(result173.mappedResult).toEqual(["单"]);
  });

  test("calculates nine zodiac self-use pattern from the TXT example", () => {
    const rule: RuleRecord = {
      id: "test-nine-zodiac",
      name: "九肖自用",
      category: "nine_zodiac",
      orderMode: "L",
      formula: "平1",
      normalizer: "nine_zodiac_plus_1_three_clash",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2],
      anchorIssue: "2026139",
      anchorPatternIndex: 0,
      positionMeaning: "取值123456.5432.123456.5432",
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "九肖自用.txt",
      examples: [],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };
    const issue175 = normalizeDraw({ issue: "2026175", n1: 7, n2: 19, n3: 30, n4: 29, n5: 28, n6: 25, special: 26 }, defaultConfig);
    const result = calculateRule(rule, issue175, defaultConfig, { periodIndex: 174 });

    expect(result.expression).toBe("平5");
    expect(result.rawResult).toBe(28);
    expect(result.normalizerSteps).toEqual([28, 29]);
    expect(result.mappedResult).toEqual(["虎", "猴", "牛", "鼠", "马", "猪", "狗", "龙", "鸡"]);
  });

  test("caches the same rule and issue calculation once", () => {
    const rule: RuleRecord = {
      id: "cache-rule",
      name: "缓存测试",
      category: "kill_zodiac",
      orderMode: "L",
      formula: "平1 + 平2 + 特码尾",
      normalizer: "zodiac_minus_48",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "cache-test",
      examples: [],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };

    clearFormulaEngineCache();
    calculateRule(rule, draw, defaultConfig, { periodIndex: 0 });
    calculateRule(rule, draw, defaultConfig, { periodIndex: 0 });

    expect(getFormulaEngineCacheSize()).toBe(1);

    calculateRule(rule, draw, defaultConfig, { periodIndex: 1 });
    expect(getFormulaEngineCacheSize()).toBe(2);
  });
});
