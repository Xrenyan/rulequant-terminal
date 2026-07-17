import { describe, expect, it } from "vitest";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { generateCandidatePool } from "@/lib/candidate-pool/candidate-pool";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { buildRuleLibraryDocxBlob } from "@/lib/export/docx-export";
import { runRuleCalculation, runRuleCalculationDetail } from "@/lib/rule-engine/rule-engine";
import { addRuleToLibrary } from "@/lib/rules/rule-library";
import { canRuleParticipateInReference } from "@/lib/rules/rule-validation";

describe("manually added rule complete workflow", () => {
  it("joins calculation, detail, backtest, reference evidence and export after one save", async () => {
    const added = addRuleToLibrary({
      existingRules: seedRules,
      draft: {
        name: "人工新增全链路测试公式",
        category: "include_zodiac",
        orderMode: "L",
        formula: "平1 + 2",
        normalizer: "subtract_48_to_1_49",
        target: "special_zodiac",
        sourceType: "manual",
        enabled: true,
        participatesInReference: true,
        canCompute: true,
        parseStatus: "parsed",
        verifyStatus: "unchecked",
        tags: ["人工新增", "全链路"],
        description: "验证人工新增公式会进入所有正式计算流程。",
        sourceFile: "人工新增",
        examples: [],
      },
      now: "2026-07-17T08:00:00.000Z",
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const manualRule = added.rule;
    expect(manualRule).toMatchObject({
      sourceType: "manual",
      enabled: true,
      participatesInReference: true,
    });
    expect(canRuleParticipateInReference(manualRule)).toBe(true);

    const latest = normalizeDraw(seedDraws.at(-1)!, seedConfig);
    const calculation = runRuleCalculation(manualRule, latest, seedConfig);
    expect(Number.isFinite(calculation.rawResult)).toBe(true);
    expect(calculation.mappedResult.length).toBeGreaterThan(0);

    const previous = normalizeDraw(seedDraws.at(-2)!, seedConfig);
    const detail = runRuleCalculationDetail({
      rule: manualRule,
      current: previous,
      futureDraws: [latest],
      config: seedConfig,
      periodIndex: seedDraws.length - 2,
    });
    expect(detail.ruleId).toBe(manualRule.id);
    expect(detail.variables).not.toEqual({});
    expect(detail.process.length).toBeGreaterThan(0);
    expect(detail.nextIssue).toBe(latest.issue);

    const backtest = runBacktest({ draws: seedDraws, rules: [manualRule], config: seedConfig });
    expect(backtest.ruleResults).toHaveLength(1);
    expect(backtest.ruleResults[0].total).toBeGreaterThan(0);
    expect(backtest.ruleResults[0].error).toBeUndefined();

    const reference = generateCandidatePool({ draws: seedDraws, rules: [manualRule], config: seedConfig, backtest });
    expect(reference.ruleCount).toBe(1);
    expect(reference.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: manualRule.id, sourceType: "manual" }),
    ]));
    expect(reference.allNumbers.some((number) =>
      [...number.supportRules, ...number.opposeRules].some((evidence) => evidence.ruleId === manualRule.id),
    )).toBe(true);

    const blob = await buildRuleLibraryDocxBlob(added.rules);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });
});
