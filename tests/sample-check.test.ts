import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { runSampleChecks } from "@/lib/sample-check/run-sample-checks";
import type { DrawRecord, RuleRecord, SampleCase } from "@/types/domain";

const draws: DrawRecord[] = [
  { issue: "001", n1: 13, n2: 28, n3: 7, n4: 41, n5: 2, n6: 36, special: 19 },
  { issue: "002", n1: 1, n2: 14, n3: 22, n4: 35, n5: 40, n6: 45, special: 8 },
];

const rule: RuleRecord = {
  id: "kill-zodiac",
  name: "杀鼠样例",
  category: "kill_zodiac",
  orderMode: "L",
  formula: "平1 + 平2 + 特码尾 + 总数尾 + 59",
  normalizer: "subtract_48_to_1_49",
  target: "special_zodiac",
  verifyMode: "next_special",
  positionPattern: [],
  periodSpan: 1,
  enabled: true,
  tags: ["sample"],
  description: "",
  sourceFile: "unit",
  examples: [],
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
};

describe("sample check engine", () => {
  test("passes matching manual examples and reports mismatches by stage", () => {
    const cases: SampleCase[] = [
      {
        id: "pass",
        ruleId: "kill-zodiac",
        issue: "001",
        expectedRawResult: 115,
        expectedFinalResult: 19,
        expectedMappedResult: ["鼠"],
        expectedSuccess: true,
        sourceFile: "unit",
      },
      {
        id: "fail",
        ruleId: "kill-zodiac",
        issue: "001",
        expectedRawResult: 114,
        expectedFinalResult: 18,
        expectedMappedResult: ["牛"],
        expectedSuccess: false,
        sourceFile: "unit",
      },
    ];

    const result = runSampleChecks({ cases, draws, rules: [rule], config: defaultConfig });

    expect(result[0].passed).toBe(true);
    expect(result[1].passed).toBe(false);
    expect(result[1].differences.map((item) => item.type)).toEqual([
      "formula_result",
      "normalized_result",
      "zodiac_mapping",
      "verification_result",
    ]);
  });

  test("checks the real hand-calculated image example for issue 172", () => {
    const imageDraws: DrawRecord[] = [
      { issue: "2026172", n1: 5, n2: 12, n3: 42, n4: 46, n5: 44, n6: 13, special: 44 },
      { issue: "2026173", n1: 6, n2: 21, n3: 35, n4: 9, n5: 18, n6: 40, special: 26 },
    ];
    const imageRule: RuleRecord = {
      id: "image-kill-zodiac",
      name: "图片手算杀一肖",
      category: "kill_zodiac",
      orderMode: "L",
      formula: "2 + 平2五行值 + 平3 + 平4合 + 平5段 + 平6波色值",
      normalizer: "subtract_48_to_1_49",
      target: "special_zodiac",
      verifyMode: "next_special",
      positionPattern: [],
      periodSpan: 1,
      enabled: true,
      tags: ["sample"],
      description: "",
      sourceFile: "图片样例",
      examples: [],
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z",
    };
    const zodiacFor14 = Object.entries(defaultConfig.zodiacTable).find(([, numbers]) => numbers.includes(14))?.[0];
    const cases: SampleCase[] = [
      {
        id: "image-172",
        ruleId: "image-kill-zodiac",
        issue: "2026172",
        expectedRawResult: 62,
        expectedFinalResult: 14,
        expectedMappedResult: zodiacFor14 ? [zodiacFor14] : undefined,
        expectedSuccess: false,
        sourceFile: "90671526093700bbb4e170db89f28d3f.jpg",
        note: "172期：2 + 1 + 42 + 10 + 7 + 0 = 62；62 对应蛇；173期开蛇26；杀蛇错误。",
      },
    ];

    const result = runSampleChecks({ cases, draws: imageDraws, rules: [imageRule], config: defaultConfig });

    expect(result[0].passed).toBe(true);
    expect(result[0].detail?.variables).toMatchObject({
      平2五行值: 1,
      平3: 42,
      平4合: 10,
      平5段: 7,
      平6波色值: 0,
    });
  });
});
