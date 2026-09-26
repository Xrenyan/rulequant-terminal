import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { normalizeDraw } from "@/lib/engine/attributes";
import { evaluateFormula } from "@/lib/formula/evaluate";
import { canonicalFormulaForSignature } from "@/lib/rules/rule-library";

const draw = normalizeDraw({ issue: "2026268", n1: 10, n2: 20, n3: 30, n4: 40, n5: 25, n6: 35, special: 36 }, defaultConfig);

describe("用户确认的期数和总分写法", () => {
  it.each(["期数头", "期号头", "期头"])("%s 取期数十位，不取百位或年份", (name) => {
    const current = normalizeDraw({ ...draw, issue: "2026257" }, defaultConfig);
    expect(evaluateFormula(name, current, defaultConfig, "D").value).toBe(5);
    expect(evaluateFormula(name, normalizeDraw({ ...draw, issue: "2026007" }, defaultConfig), defaultConfig, "L").value).toBe(0);
  });

  it.each(["期数合", "期号合", "期合"])("%s 只加期数后三位", (name) => {
    expect(evaluateFormula(name, draw, defaultConfig, "L").value).toBe(16);
    expect(evaluateFormula(`${name}尾`, draw, defaultConfig, "L").value).toBe(6);
  });

  it.each(["总数合尾", "总分合尾", "总和合尾", "总合尾"])("%s 是总和196的各位相加16再取尾6", (name) => {
    const result = evaluateFormula(name, draw, defaultConfig, "L");
    expect(draw.total).toBe(196);
    expect(result.value).toBe(6);
    expect(result.variables).toEqual({ [name]: 6 });
    expect(result.trace).toContain(`${name} = 6`);
  });

  it("保留总分和、总分合、总分合尾的不同含义", () => {
    const result = evaluateFormula("总分和+总分合+总分合尾", draw, defaultConfig, "L");
    expect(result.variables).toEqual({ 总分和: 196, 总分合: 16, 总分合尾: 6 });
    expect(result.value).toBe(218);
  });

  it("同义写法和加法顺序不生成重复公式，合与合尾仍可区分", () => {
    const base = canonicalFormulaForSignature("总数合尾+期头+期合尾+期合");
    for (const name of ["总分合尾", "总和合尾", "总合尾"]) {
      expect(canonicalFormulaForSignature(`期数合+期数合尾+期数头+${name}`)).toBe(base);
    }
    expect(canonicalFormulaForSignature("总数合")).not.toBe(canonicalFormulaForSignature("总数合尾"));
    expect(canonicalFormulaForSignature("期头")).not.toBe(canonicalFormulaForSignature("期尾"));
  });
});
