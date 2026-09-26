import { describe, expect, it } from "vitest";
import { parsePastedKillNumberRule } from "@/lib/parsers/pasted-kill-number-rule";
import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { normalizeDraw } from "@/lib/engine/attributes";
import { defaultConfig } from "@/lib/config/default-config";
import type { RuleRecord } from "@/types/domain";

const formula = "平3尾+平4尾+特合+平3段+平6段+总分+11";

describe("complete kill-number arithmetic pasted into the new-rule builder", () => {
  it.each([
    [`177杀特码[D序]${formula}`, "D", formula],
    [`杀特码 D序 公式：${formula}`, "D", formula],
    ["178杀特码[L序]特行+落3行+落4行+落4尾+落1段+特肖位+38", "L", "特行+落3行+落4行+落4尾+落1段+特肖位+38"],
    [`计算类型：杀特码\n公式：${formula}\n号码顺序：D序`, "D", formula],
    ["杀特码【L序】公式：（落1码＋落2码）×2－特合÷1", "L", "(落1码+落2码)*2-特合/1"],
  ])("preserves every operand and the declared order: %s", (source, orderMode, expectedFormula) => {
    const parsed = parsePastedKillNumberRule(source);
    expect(parsed).toMatchObject({ status: "ready", draft: {
      formula: expectedFormula, orderMode, category: "kill_number", target: "special_number",
      normalizer: "subtract_49_to_1_49", periodSpan: 1, verifyOffset: 1,
    } });
  });

  it("keeps the rule index out of the formula and verification period and computes the complete D-order result", () => {
    const parsed = parsePastedKillNumberRule(`177杀特码[D序]${formula}`);
    if (parsed?.status !== "ready") throw new Error("Expected an editable formula");
    expect(parsed.draft.name).toBe("D序杀特码-177");
    const rule: RuleRecord = {
      id: "pasted", name: "pasted", category: "kill_number", formula: "", orderMode: "L",
      normalizer: "auto", target: "special_number", verifyMode: "next_special", periodSpan: 1,
      positionPattern: [], enabled: true, tags: [], description: "", sourceFile: "unit", examples: [],
      createdAt: "2026-09-26", updatedAt: "2026-09-26", ...parsed.draft,
    };
    const draw = normalizeDraw({ issue: "2026268", n1: 10, n2: 20, n3: 30, n4: 40, n5: 25, n6: 35, special: 36 }, defaultConfig);
    expect(calculateRule(rule, draw, defaultConfig)).toMatchObject({ rawResult: 231, finalResult: 35 });
  });

  it.each([
    `177杀特码[D序]${formula} 500连准0错`,
    `177杀特码[D序]${formula}，结果35`,
    `177杀特码[D序]${formula}\n178杀特码[L序]落1码+1`,
    `杀特码 D序 L序 公式：${formula}`,
    `杀特码 D序 公式：${formula}+`,
    "杀特码 D序 公式：(平1+平2",
    "杀特码 D序 公式：平1 平2",
    "杀特码 D序 公式：平1=10",
    "杀特码 D序 公式：",
  ])("refuses partial or ambiguous arithmetic instead of accepting only a prefix: %s", (source) => {
    expect(parsePastedKillNumberRule(source)).toMatchObject({ status: "error" });
  });

  it("does not alter existing prose-template recognition", () => {
    expect(parsePastedKillNumberRule("平码3虎05取值+1234567911")).toBeNull();
    expect(parsePastedKillNumberRule("176特码10 预测178尾数左右各3")).toBeNull();
  });
});
