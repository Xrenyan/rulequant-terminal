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

  it.each(["L", "D", "custom"] as const)("%s 序中文位置和属性别名的实际求值保持不变", (mode) => {
    const groups = [
      ["平一", "平码一", "平1", "平1码", "平1号码", "码(平1)", "号码(平码一)"],
      ["落六", "落码六", "落6", "落6码", "落6号码", "号码(落六)"],
      ["平三合数尾", "平码三合尾", "平3合尾值", "合数尾(平三)"],
      ["特行值", "特五行", "特五行值", "特码五行值", "行(特码)"],
      ["平7", "平码七", "落七", "特", "特码", "特号", "杀码", "L7", "D7"],
      ["平2位置", "平二位", "平2肖位", "平2生肖位", "位置(平2)"],
      ["平4头数单", "平四头单", "头单(平4)"],
      ["期号", "期数"],
    ];
    for (const group of groups) {
      const value = evaluateFormula(group[0], draw, defaultConfig, mode).value;
      for (const alias of group) {
        expect(evaluateFormula(alias, draw, defaultConfig, mode).value, alias).toBe(value);
      }
    }
  });

  it("D序的落六仍取第六个落球，不能变成排序后的平码六", () => {
    expect(evaluateFormula("落六", draw, defaultConfig, "D").value).toBe(35);
    expect(evaluateFormula("平码六", draw, defaultConfig, "D").value).toBe(40);
    expect(canonicalFormulaForSignature("落6", "D")).not.toBe(canonicalFormulaForSignature("平6", "D"));
    expect(canonicalFormulaForSignature("落6", "L")).toBe(canonicalFormulaForSignature("平6", "L"));
    expect(canonicalFormulaForSignature("尾(落6)", "D")).toBe(canonicalFormulaForSignature("落6尾", "D"));
  });
});
