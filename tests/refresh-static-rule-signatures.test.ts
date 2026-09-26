import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { seedRules } from "@/lib/data/seed";
import { buildRuleSignature, canonicalFormulaForSignature } from "@/lib/rules/rule-library";

describe("无依赖静态刷新与应用使用完全一致的判重口径", () => {
  it("D/L/custom位置、所有已支持别名及当前整个种子库签名一致，导入脚本不联网或写数据", () => {
    const formulas = [
      "落3头+平5尾+特行值", "平3头+平5尾+特五行值", "平一+平码二+落六+特号码", "平1码+平2号码+落6号码+特码",
      "尾(落1)+特合+期数尾+平2波", "平码三合数尾+位置(落六)+头数双(平码一)", "平七+D7+L7+落7码",
      "总数+总数合+总数合尾+总数尾", "总分和+总和合+总和合尾+总分尾", "总分合尾+总分合+总和+总合尾",
      "期数合+期数合尾+期数头+期号尾", "期号合+期号合尾+期号头+期数尾", "期合+期合尾+期头+期尾", "期号+期数",
      "L3+D4+特位", "码(平1)+号码(落6)", "特号合+平一未知", "平1-平2", "平2-平1",
      "头(平1+平2)+尾(平3+平4)", "头(平1+平4)+尾(平3+平2)", "平1++1", "平１＋平码二＋特行值",
    ];
    const cases = (["L", "D", "custom"] as const).flatMap((orderMode) => formulas.map((formula) => ({ formula, orderMode })));
    const scriptUrl = pathToFileURL(resolve("scripts/refresh-static-data.mjs")).href;
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { readFileSync } from 'node:fs';
      import { canonicalRuleFormula, ruleSignature } from ${JSON.stringify(scriptUrl)};
      const input = JSON.parse(readFileSync(0, 'utf8'));
      console.log(JSON.stringify({ formulas: input.cases.map((item) => canonicalRuleFormula(item.formula, item.orderMode)), rules: input.rules.map(ruleSignature) }));
    `], { input: JSON.stringify({ cases, rules: seedRules }), encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 10000 }));
    expect(result.formulas).toEqual(cases.map((item) => canonicalFormulaForSignature(item.formula, item.orderMode)));
    expect(result.rules).toEqual(seedRules.map(buildRuleSignature));
  });
});
