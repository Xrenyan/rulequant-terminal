import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { evaluateFormula } from "@/lib/formula/evaluate";
import { calculateRule, clearFormulaEngineCache, getFormulaEngineCacheSize } from "@/lib/formula-engine/formula-engine";
import { getNumberAttributes, normalizeDraw } from "@/lib/engine/attributes";
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

  test("supports include zodiac rules as positive signals", () => {
    const rule: RuleRecord = {
      id: "include-zodiac-rule",
      name: "选生肖",
      category: "include_zodiac",
      orderMode: "L",
      formula: "特码",
      normalizer: "auto",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };

    const result = calculateRule(rule, draw, defaultConfig);

    expect(result.mappedResult).toEqual([draw.specialAttributes.zodiac]);
    expect(result.process).toContain(`参考生肖 ${draw.specialAttributes.zodiac}`);
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

  test("distinguishes code variables from fixed zodiac position variables", () => {
    const result = evaluateFormula("平码3 + 平三码 + 平3 + 平四码 + 平4位 + 特码位", draw, defaultConfig, "L");

    expect(result.value).toBe(66);
    expect(result.variables).toMatchObject({
      平码3: 7,
      平三码: 7,
      平3: 7,
      平四码: 41,
      平4位: 3,
      特码位: 1,
    });
  });

  test("normalizes pasted keycap digits and simple text separators", () => {
    const result = evaluateFormula("平3、平4️⃣", draw, defaultConfig, "L");

    expect(result.expression).toBe("平3+平4");
    expect(result.value).toBe(48);
    expect(result.variables).toMatchObject({
      平3: 7,
      平4: 41,
    });
  });

  test("uses order mode for 平码 variables while 落码 stays in original draw order", () => {
    const result = evaluateFormula("平三码 + 落三码 + 平3位", draw, defaultConfig, "D");

    expect(result.value).toBe(27);
    expect(result.variables).toMatchObject({
      平三码: 13,
      落三码: 7,
      平3位: 7,
    });
  });

  test("position pattern only rewrites whole 平/落 variables, not attribute variables", () => {
    const keepAttributeRule: RuleRecord = {
      id: "pattern-keeps-zodiac-position",
      name: "取位不改平3位",
      category: "include_zodiac",
      orderMode: "L",
      formula: "平3位",
      normalizer: "auto",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [5],
      anchorIssue: "2026156",
      anchorPatternIndex: 0,
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
    };
    const rewriteWholeVariableRule: RuleRecord = {
      ...keepAttributeRule,
      id: "pattern-rewrites-whole-position",
      name: "取位改平1",
      formula: "平1",
    };

    const attributeResult = calculateRule(keepAttributeRule, draw, defaultConfig, { periodIndex: 0 });
    const wholeVariableResult = calculateRule(rewriteWholeVariableRule, draw, defaultConfig, { periodIndex: 0 });

    expect(attributeResult.expression).toBe("平3位");
    expect(attributeResult.rawResult).toBe(1);
    expect(attributeResult.variables).toMatchObject({ 平3位: 1 });
    expect(wholeVariableResult.expression).toBe("平5");
    expect(wholeVariableResult.rawResult).toBe(draw.lOrder[4]);
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

  test("calculates seven-tail offsets with 0-9 closed loop", () => {
    const rule: RuleRecord = {
      id: "test-seven-tail-loop",
      name: "seven tail loop",
      category: "seven_tail",
      orderMode: "L",
      formula: "0",
      normalizer: "tail_offsets:-3,-2,-1,0,1,2,4",
      target: "special_tail",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };

    const result = calculateRule(rule, draw, defaultConfig);

    expect(result.mappedResult).toEqual([7, 8, 9, 0, 1, 2, 4]);
    expect(result.process).toContain("0 -3 -> 7");
  });

  test("calculates custom tail window left and right counts", () => {
    const rule: RuleRecord = {
      id: "test-tail-window",
      name: "tail window",
      category: "seven_tail",
      orderMode: "L",
      formula: "0",
      normalizer: "tail_window:left=2,right=4",
      target: "special_tail",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };

    const result = calculateRule(rule, draw, defaultConfig);

    expect(result.mappedResult).toEqual([8, 9, 0, 1, 2, 3, 4]);
  });

  test("calculates nine-zodiac number offsets with 12-step closed loop", () => {
    const rule: RuleRecord = {
      id: "test-nine-zodiac-offsets",
      name: "nine zodiac offsets",
      category: "nine_zodiac",
      orderMode: "L",
      formula: "5",
      normalizer: "zodiac_offsets:+1234567911",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
    };
    const result = calculateRule(rule, draw, defaultConfig);
    const expectedNumbers = [6, 7, 8, 9, 10, 11, 12, 14, 16];

    expect(result.secondaryMappedResult).toEqual(expectedNumbers);
    expect(result.mappedResult).toEqual(expectedNumbers.map((number) => getNumberAttributes(number, defaultConfig).zodiac));

    const subtractRule = { ...rule, id: "test-nine-zodiac-negative", normalizer: "zodiac_offsets:-7" };
    const subtractResult = calculateRule(subtractRule, draw, defaultConfig);
    expect(subtractResult.secondaryMappedResult).toEqual([10]);
  });

  test("calculates six-zodiac sets from cyclic regular positions and selected offsets", () => {
    const rule: RuleRecord = {
      id: "test-six-zodiac-position-offsets",
      name: "取平321循环六肖",
      category: "six_zodiac" as RuleRecord["category"],
      orderMode: "L",
      formula: "平3",
      normalizer: "zodiac_set_offsets:+012348",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [3, 2, 1],
      positionMeaning: "取平321.321循环+012348",
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-06-28T00:00:00.000Z",
      updatedAt: "2026-06-28T00:00:00.000Z",
    };

    const result = calculateRule(rule, draw, defaultConfig);
    const expectedNumbers = [7, 29, 15, 10, 32, 21];
    const expectedRows = [
      [3, 7, 0, 7],
      [2, 28, 1, 29],
      [1, 13, 2, 15],
      [3, 7, 3, 10],
      [2, 28, 4, 32],
      [1, 13, 8, 21],
    ] as const;

    expect(result.secondaryMappedResult).toEqual(expectedNumbers);
    expect(result.mappedResult).toEqual(expectedNumbers.map((number) => getNumberAttributes(number, defaultConfig).zodiac));
    expect(result.process).toEqual(expect.arrayContaining(expectedRows.map(([position, base, offset, resultNumber]) =>
      `第${position}位 ${String(base).padStart(2, "0")} ${getNumberAttributes(base, defaultConfig).zodiac} +${offset} -> ${String(resultNumber).padStart(2, "0")} ${getNumberAttributes(resultNumber, defaultConfig).zodiac}`,
    )));

    const twelveOffsetResult = calculateRule(
      { ...rule, id: "test-twelve-zodiac-offsets", normalizer: "zodiac_set_offsets:+123456789101112", positionPattern: [3] },
      draw,
      defaultConfig,
    );
    expect(twelveOffsetResult.secondaryMappedResult).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
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

  test("calculates corrected half-head, color-value and door rules", () => {
    const baseRule: RuleRecord = {
      id: "special-category-rule",
      name: "专项规则",
      category: "kill_half_head",
      orderMode: "L",
      formula: "6",
      normalizer: "half_head_digit",
      target: "special_number",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: [],
      description: "",
      sourceFile: "unit",
      examples: [],
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };

    const halfHead = calculateRule(baseRule, draw, defaultConfig);
    expect(halfHead.secondaryMappedResult).toEqual(["2头双"]);
    expect(halfHead.mappedResult).toEqual([20, 22, 24, 26, 28]);

    const color = calculateRule({ ...baseRule, id: "color-value-rule", category: "kill_color", formula: "5", normalizer: "mod_3", target: "special_color" }, draw, defaultConfig);
    expect(color.finalResult).toBe(2);
    expect(color.mappedResult).toEqual(["绿"]);

    const door = calculateRule({ ...baseRule, id: "door-rule", category: "kill_door", formula: "11", normalizer: "subtract_5_to_1_5" }, draw, defaultConfig);
    expect(door.finalResult).toBe(1);
    expect(door.secondaryMappedResult).toEqual(["1门"]);
    expect(door.mappedResult).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
