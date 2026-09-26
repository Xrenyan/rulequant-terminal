import { describe, expect, it } from "vitest";

import staticCloudState from "../public/static-cloud-state.json";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";

const prefix = "rq-user-20260926-kill-number-";
const source = "用户提供：2026-09-26 第177—188条";
const suppliedFormulas = [
  [177, "D", "平3尾+平4尾+特合+平3段+平6段+总分+11"],
  [178, "L", "特行+落3行+落4行+落4尾+落1段+特肖位+38"],
  [179, "D", "特波+平2波+特段+平5码+29"],
  [180, "D", "平6行+特合+平3合+18"],
  [181, "D", "平6尾+平5码+27"],
  [182, "D", "平6段+平6位+平6合尾+18"],
  [183, "L", "落5头+落5波+落1段+落4位+总分合尾+11"],
  [184, "L", "落5合尾+落4头+落4尾+落5段+落6段+落6位+落2码+落6合尾+6"],
  [185, "D", "平6行+平2头+平4波+平1合+平6合尾+期合+8"],
  [186, "L", "落6行+落2波+落3尾+落5合+特段+落6位+特号+落5码+期号+特合尾+40"],
  [187, "L", "落3合+落4合+落1段+期号+23"],
  [188, "D", "平5头+平1波+平4段+平2位+平2码+期尾+37"],
] as const;

const septemberRules = seedRules.filter((rule) => rule.id.startsWith(prefix));

describe("2026-09-26 用户补充的第177—188条杀特码规则", () => {
  it("在种子规则和静态快照中各保存完整且唯一的12条原公式", () => {
    const expectedIds = suppliedFormulas.map(([number]) => `${prefix}${number}`);
    expect(septemberRules.map((rule) => rule.id)).toEqual(expectedIds);
    expect(staticCloudState.rules.filter((rule) => rule.id.startsWith(prefix))).toEqual(septemberRules);
    expect(new Set(seedRules.map((rule) => rule.id)).size).toBe(seedRules.length);
    expect(new Set(staticCloudState.rules.map((rule) => rule.id)).size).toBe(staticCloudState.rules.length);

    for (const [number, orderMode, formula] of suppliedFormulas) {
      const rule = septemberRules.find((item) => item.id === `${prefix}${number}`);
      expect(rule).toMatchObject({
        name: `${orderMode}序杀特码-${number}`,
        formula,
        orderMode,
        category: "kill_number",
        target: "special_number",
        normalizer: "subtract_49_to_1_49",
        verifyMode: "next_special",
        verifyOffset: 1,
        periodSpan: 1,
        enabled: true,
        participatesInReference: true,
        sourceType: "user_provided",
        sourceFile: source,
        origin: source,
        canCompute: true,
        parseStatus: "parsed",
        verifyStatus: "no_sample",
        manuallyConfirmed: false,
        examples: [],
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
      });
    }
  });

  it("不会把未经核实的来源表现保存为验证结论或真实统计", () => {
    const statisticsFields = ["total", "success", "failed", "hitRate", "successRate", "winRate", "currentStreak", "maxStreak", "stats", "performance"];

    for (const rule of septemberRules) {
      expect(rule.verifyStatus).toBe("no_sample");
      expect(rule.examples).toEqual([]);
      expect(`${rule.name} ${rule.description} ${rule.tags.join(" ")}`).not.toMatch(/500连准|0错|0%/);
      for (const field of statisticsFields) expect(rule).not.toHaveProperty(field);
      expect(rule.description).toContain("超过49持续减49");
      expect(rule.description).toContain("49保持49");
      expect(rule.description).toContain("不转换生肖");
    }
  });

  it("没有与现有规则重复的计算签名", () => {
    for (const rule of septemberRules) {
      const signature = buildRuleSignature(rule);
      expect(seedRules.filter((existing) => buildRuleSignature(existing) === signature).map((existing) => existing.id)).toEqual([rule.id]);
    }
  });

  it("所有12条均能使用完整种子历史回测，且只排除一个号码", () => {
    const result = runBacktest({
      draws: seedDraws,
      rules: septemberRules,
      config: seedConfig,
      cache: false,
    });

    expect(result.ruleResults).toHaveLength(suppliedFormulas.length);
    for (const ruleResult of result.ruleResults) {
      expect(ruleResult.error, ruleResult.rule.id).toBeUndefined();
      expect(ruleResult.total).toBe(seedDraws.length - 1);
      expect(ruleResult.details).toHaveLength(seedDraws.length - 1);

      for (const detail of ruleResult.details) {
        const expectedNumber = ((detail.rawResult - 1) % 49) + 1;
        expect(detail.finalResult).toBe(expectedNumber);
        expect(detail.mappedResult).toEqual([expectedNumber]);
        expect(detail.futureChecks).toHaveLength(1);
        expect(detail.success).toBe(detail.futureChecks[0].special !== expectedNumber);
      }
    }

    const latestDraw = normalizeDraw(seedDraws.at(-1)!, seedConfig);
    for (const rule of septemberRules) {
      const calculation = calculateRule(rule, latestDraw, seedConfig, { cache: false });
      expect(Number.isFinite(calculation.rawResult), rule.id).toBe(true);
      expect(calculation.mappedResult).toEqual([calculation.finalResult]);
      expect(calculation.finalResult).toBeGreaterThanOrEqual(1);
      expect(calculation.finalResult).toBeLessThanOrEqual(49);
    }
  });
});
