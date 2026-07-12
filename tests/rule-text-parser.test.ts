import { describe, expect, test } from "vitest";
import { parseRuleTextFile } from "@/lib/parsers/rule-text-parser";

describe("rule text parser", () => {
  test("parses a normal TXT formula without replacing the library", () => {
    const text = [
      "计算类型：七尾",
      "公式：平1尾+平2段+平2五行值+平5合",
      "号码顺序：L序（落球顺序）",
    ].join("\n");

    const result = parseRuleTextFile(text, "澳门七尾规公式2：.txt");

    expect(result.errors).toEqual([]);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toMatchObject({
      category: "seven_tail",
      orderMode: "L",
      formula: "平1尾+平2段+平2五行值+平5合",
      sourceType: "txt_import",
      participatesInReference: true,
      enabled: true,
    });
  });

  test("parses nine zodiac TXT position pattern and anchor from examples", () => {
    const text = [
      "九肖规律自用、、(3个括号内的肖都是+1+3+5的肖的对冲肖+123456。取值123456.5432.123456.5432.)",
      "175平5兔28+1=29虎(猴)牛鼠(马)猪狗(龙)鸡，176",
      "174平6狗21+1=22鸡(兔)猴羊(牛)马蛇(猪)龙，175蛇26√",
    ].join("\n");

    const result = parseRuleTextFile(text, "九肖自用.txt");

    expect(result.errors).toEqual([]);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toMatchObject({
      category: "nine_zodiac",
      formula: "平1",
      positionPattern: [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2],
      anchorIssue: "2026175",
      anchorPatternIndex: 6,
    });
  });

  test.each([
    ["杀半头", "平1头+平2头", "D", "kill_half_head", "half_head_digit", "special_number"],
    ["杀一门", "平2尾+平3尾+特码合+特码五行值+期数尾", "L", "kill_door", "subtract_5_to_1_5", "special_number"],
    ["杀一波", "平1+平2五行值+平4头+平4波色值+平5段+特码尾", "L", "kill_color", "mod_3", "special_color"],
  ])("parses %s TXT into the unified rule library shape", (type, formula, orderMode, category, normalizer, target) => {
    const result = parseRuleTextFile(`计算类型：${type}\n公式：${formula}\n号码顺序：${orderMode}序`, `${type}.txt`);
    expect(result.errors).toEqual([]);
    expect(result.rules[0]).toMatchObject({ category, formula, orderMode, normalizer, target, sourceType: "txt_import" });
  });
});
