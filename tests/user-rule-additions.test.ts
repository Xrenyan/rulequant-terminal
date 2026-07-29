import { describe, expect, it } from "vitest";

import seedDraws from "@/../data/sample-draws.json";
import seedRules from "@/../data/sample-rules.json";
import { defaultConfig } from "@/lib/config/default-config";
import { normalizeDraw } from "@/lib/engine/attributes";
import { evaluateFormula } from "@/lib/formula/evaluate";
import { calculateRule, checkRuleSuccess } from "@/lib/formula-engine/formula-engine";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const draws = seedDraws as DrawRecord[];
const rules = seedRules as RuleRecord[];

function draw(issue: string) {
  const match = draws.find((item) => item.issue === issue);
  if (!match) throw new Error(`缺少测试期号 ${issue}`);
  return normalizeDraw(match, defaultConfig);
}

function rule(id: string) {
  const match = rules.find((item) => item.id === id);
  if (!match) throw new Error(`缺少测试公式 ${id}`);
  return match;
}

describe("2026-07-29 用户补充规则", () => {
  it("支持总分别名、完整期号和固定生肖位置", () => {
    const current = draw("2026206");
    const result = evaluateFormula(
      "总分 + 总分尾 + 总分合 + 期号 + 平3位 + 特肖位",
      current,
      defaultConfig,
      "D",
    );

    expect(result.variables).toMatchObject({
      总分: 220,
      总分尾: 0,
      总分合: 4,
      期号: 206,
      平3位: 9,
      特肖位: 9,
    });
    expect(result.value).toBe(448);
  });

  it.each([
    ["rq-user-20260729-kill-sum-01", 47, 8],
    ["rq-user-20260729-kill-sum-02", 31, 5],
    ["rq-user-20260729-kill-sum-03", 17, 4],
    ["rq-user-20260729-kill-sum-04", 70, 5],
    ["rq-user-20260729-kill-sum-05", 49, 10],
  ])("复算杀合样例 %s", (ruleId, rawResult, finalResult) => {
    const calculation = calculateRule(rule(ruleId), draw("2026206"), defaultConfig, { cache: false });
    expect(calculation.rawResult).toBe(rawResult);
    expect(calculation.finalResult).toBe(finalResult);
    expect(calculation.mappedResult).toEqual([finalResult]);
  });

  it.each([
    ["rq-user-20260729-seven-tail-01", 47, [7, 8, 9, 0, 1, 2, 3]],
    ["rq-user-20260729-seven-tail-02", 508, [8, 9, 0, 1, 2, 3, 4]],
    ["rq-user-20260729-seven-tail-03", 248, [8, 9, 0, 1, 2, 3, 4]],
    ["rq-user-20260729-seven-tail-04", 13, [3, 4, 5, 6, 7, 8, 9]],
  ])("复算七尾样例 %s", (ruleId, rawResult, tails) => {
    const calculation = calculateRule(rule(ruleId), draw("2026206"), defaultConfig, { cache: false });
    expect(calculation.rawResult).toBe(rawResult);
    expect(calculation.mappedResult).toEqual(tails);
  });

  it.each([
    ["2026200", 68, 2, "蓝波双"],
    ["2026201", 56, 2, "蓝波双"],
    ["2026202", 67, 1, "红波单"],
    ["2026203", 48, 0, "红波双"],
    ["2026204", 23, 5, "绿波单"],
    ["2026205", 28, 4, "绿波双"],
    ["2026206", 73, 1, "红波单"],
    ["2026207", 54, 0, "红波双"],
  ])("复算杀半波 %s 期样例", (issue, rawResult, finalResult, label) => {
    const calculation = calculateRule(
      rule("rq-user-20260729-kill-half-color-01"),
      draw(issue),
      defaultConfig,
      { cache: false },
    );
    expect(calculation.rawResult).toBe(rawResult);
    expect(calculation.finalResult).toBe(finalResult);
    expect(calculation.secondaryMappedResult).toEqual([label]);
    expect(calculation.normalizerSteps.at(-1)).toBe(finalResult);
  });

  it("杀半波按波色和单双共同排除号码，并能参与下一期验证", () => {
    const formula = rule("rq-user-20260729-kill-half-color-01");
    const calculation = calculateRule(formula, draw("2026206"), defaultConfig, { cache: false });

    expect(calculation.mappedResult).toEqual([1, 7, 13, 19, 23, 29, 35, 45]);
    expect(checkRuleSuccess(formula, calculation, draw("2026207"))).toBe(true);
  });

  it("复算 210 期杀一头手算样例", () => {
    const sample = normalizeDraw({
      issue: "2026209",
      date: "2026-07-28",
      n1: 5,
      n2: 6,
      n3: 11,
      n4: 12,
      n5: 13,
      n6: 44,
      special: 31,
    }, defaultConfig);
    const calculation = calculateRule(
      rule("rq-user-20260729-kill-head-01"),
      sample,
      defaultConfig,
      { cache: false },
    );

    expect(calculation.variables).toMatchObject({
      平1波色值: 2,
      平3波色值: 2,
      平6: 44,
    });
    expect(calculation.rawResult).toBe(52);
    expect(calculation.finalResult).toBe(2);
  });
});
