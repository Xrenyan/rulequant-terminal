import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import {
  getNumberAttributes,
  normalizeDraw,
  normalizeHead,
  normalizeSegment,
  normalizeSum,
  normalizeTail,
  normalizeZodiacNumber,
} from "@/lib/engine/attributes";

describe("draw and number normalization", () => {
  test("generates L order, D order, special, total and issue attributes", () => {
    const draw = normalizeDraw(
      {
        issue: "2026156",
        date: "2026-06-06",
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

    expect(draw.lOrder).toEqual([13, 28, 7, 41, 2, 36, 19]);
    expect(draw.dOrder).toEqual([2, 7, 13, 28, 36, 41, 19]);
    expect(draw.special).toBe(19);
    expect(draw.total).toBe(146);
    expect(draw.totalTail).toBe(6);
    expect(draw.totalSum).toBe(11);
    expect(draw.issueTail).toBe(6);
    expect(draw.issueSum).toBe(12);
    expect(draw.issueSumTail).toBe(2);
  });

  test("calculates head tail sum segment zodiac color and element", () => {
    const attrs = getNumberAttributes(19, defaultConfig);

    expect(attrs).toMatchObject({
      number: 19,
      head: 1,
      tail: 9,
      sum: 10,
      sumTail: 0,
      segment: 3,
      zodiac: "鼠",
      color: "红",
      colorValue: 0,
      element: "火",
      elementValue: 4,
      headParity: "1头单",
      headParityType: "头单",
    });
  });

  test("prefers parsed page attributes when a draw carries raw ball metadata", () => {
    const draw = normalizeDraw(
      {
        issue: "2026001",
        date: "2026-01-01",
        n1: 27,
        n2: 8,
        n3: 43,
        n4: 33,
        n5: 42,
        n6: 11,
        special: 29,
        rawAttributes: {
          balls: [
            { number: 27, zodiac: "兔", element: "土", color: "绿" },
            { number: 8, zodiac: "狗", element: "木", color: "红" },
            { number: 43, zodiac: "猪", element: "水", color: "绿" },
            { number: 33, zodiac: "鸡", element: "金", color: "绿" },
            { number: 42, zodiac: "鼠", element: "金", color: "蓝" },
            { number: 11, zodiac: "羊", element: "金", color: "绿" },
            { number: 29, zodiac: "牛", element: "水", color: "红" },
          ],
        },
      },
      defaultConfig,
    );

    expect(draw.attributes[0].zodiac).toBe("兔");
    expect(draw.specialAttributes).toMatchObject({ number: 29, zodiac: "牛", element: "水", color: "红" });
  });

  test("normalizers match the rule reductions", () => {
    expect(normalizeZodiacNumber(115)).toEqual({ value: 19, steps: [115, 67, 19] });
    expect(normalizeSum(40)).toEqual({ value: 1, steps: [40, 27, 14, 1] });
    expect(normalizeTail(123)).toEqual({ value: 3, steps: [123, 3] });
    expect(normalizeHead(17)).toEqual({ value: 2, steps: [17, 12, 7, 2] });
    expect(normalizeSegment(23)).toEqual({ value: 2, steps: [23, 16, 9, 2] });
  });
});
