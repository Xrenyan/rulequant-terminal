import { describe, expect, it } from "vitest";
import { buildReferenceObservation, clearCandidatePoolCache, generateCandidatePool, getCandidatePoolCacheSize } from "@/lib/candidate-pool/candidate-pool";
import { runBacktest } from "@/lib/backtest/run-backtest";
import { seedConfig, seedDraws, seedRules } from "@/lib/data/seed";

describe("candidate pool", () => {
  it("caches identical candidate reports", () => {
    const rules = seedRules.map((rule) => ({ ...rule, manuallyConfirmed: true }));
    const backtest = runBacktest({ draws: seedDraws, rules, config: seedConfig });

    clearCandidatePoolCache();
    generateCandidatePool({ draws: seedDraws, rules, config: seedConfig, backtest });
    generateCandidatePool({ draws: seedDraws, rules, config: seedConfig, backtest });

    expect(getCandidatePoolCacheSize()).toBe(1);
  });

  it("combines enabled rule outputs into ranked zodiac and number candidates", () => {
    const confirmedRules = seedRules.map((rule) => ({ ...rule, manuallyConfirmed: true }));
    const backtest = runBacktest({ draws: seedDraws, rules: confirmedRules, config: seedConfig });
    const report = generateCandidatePool({ draws: seedDraws, rules: confirmedRules, config: seedConfig, backtest });

    expect(report.latestIssue).toBe(seedDraws.at(-1)?.issue);
    expect(report.ruleCount).toBe(confirmedRules.filter((rule) => rule.enabled).length);
    expect(report.topNumbers8).toHaveLength(8);
    expect(report.topNumbers12).toHaveLength(12);
    expect(report.topNumbers16).toHaveLength(16);
    expect(report.topNumbers18).toHaveLength(18);
    expect(report.topZodiacs7).toHaveLength(7);
    expect(report.topZodiacs8).toHaveLength(8);
    expect(report.topZodiacs9).toHaveLength(9);
    expect(report.riskNotice).toContain("综合参考结果");
  });

  it("keeps support and oppose evidence on each candidate", () => {
    const confirmedRules = seedRules.map((rule) => ({ ...rule, manuallyConfirmed: true }));
    const backtest = runBacktest({ draws: seedDraws, rules: confirmedRules, config: seedConfig });
    const report = generateCandidatePool({ draws: seedDraws, rules: confirmedRules, config: seedConfig, backtest });
    const candidateWithEvidence = report.allNumbers.find((candidate) => candidate.supportRules.length && candidate.opposeRules.length);

    expect(candidateWithEvidence).toBeDefined();
    expect(candidateWithEvidence?.supportRules[0]).toMatchObject({
      ruleId: expect.any(String),
      ruleName: expect.any(String),
      action: "include",
      weight: expect.any(Number),
    });
    expect(candidateWithEvidence?.opposeRules[0].action).toBe("exclude");
  });

  it("keeps kill-three-as-nine as both nine-zodiac support and kill-zodiac opposition", () => {
    const confirmedRules = seedRules.map((rule) => ({ ...rule, manuallyConfirmed: true }));
    const backtest = runBacktest({ draws: seedDraws, rules: confirmedRules, config: seedConfig });
    const report = generateCandidatePool({ draws: seedDraws, rules: confirmedRules, config: seedConfig, backtest });
    const signals = report.signals.filter((signal) => signal.ruleId === "rq-kill-three-as-nine");

    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetType: "zodiac", action: "include" }),
        expect.objectContaining({ targetType: "zodiac", action: "exclude" }),
      ]),
    );
    expect(signals.flatMap((signal) => signal.targets)).toEqual(expect.arrayContaining(seedConfig.zodiacOrder));
  });

  it("ignores enabled rules that are not allowed to join the reference result", () => {
    const rules = [
      { ...seedRules[0], manuallyConfirmed: true },
      {
        ...seedRules[1],
        id: "not-reference",
        enabled: true,
        manuallyConfirmed: true,
        participatesInReference: false,
      },
    ];
    const backtest = runBacktest({ draws: seedDraws, rules, config: seedConfig });
    const report = generateCandidatePool({ draws: seedDraws, rules, config: seedConfig, backtest });

    expect(report.ruleCount).toBe(1);
    expect(report.signals.some((signal) => signal.ruleId === "not-reference")).toBe(false);
  });

  it("allows user-provided formulas without sample checks to produce real evidence", () => {
    const rules = [{ ...seedRules[0], manuallyConfirmed: false }];
    const backtest = runBacktest({ draws: seedDraws, rules, config: seedConfig });
    const validationSummaries = [{
      ruleId: rules[0].id,
      status: "unchecked" as const,
      label: "未做样例核对",
      tone: "yellow" as const,
      canJoinReference: true,
      reason: "用户提供公式，未核对也可参与",
      sampleCount: 0,
      passedSampleCount: 0,
      mismatchCount: 0,
    }];

    const report = generateCandidatePool({ draws: seedDraws, rules, config: seedConfig, backtest, validationSummaries });

    expect(report.ruleCount).toBe(1);
    expect(report.signalCount).toBeGreaterThan(0);
    expect(report.topNumbers8.every((candidate) => candidate.supportCount + candidate.opposeCount > 0)).toBe(true);
    expect(report.topNumbers18.every((candidate) => candidate.supportCount + candidate.opposeCount > 0)).toBe(true);
  });

  it("does not expose fake top results when formulas are disabled or explicitly excluded", () => {
    const excludedRules = seedRules.slice(0, 2).map((rule, index) => ({
      ...rule,
      enabled: index === 0 ? false : true,
      participatesInReference: false,
    }));
    const backtest = runBacktest({ draws: seedDraws, rules: excludedRules, config: seedConfig });
    const report = generateCandidatePool({ draws: seedDraws, rules: excludedRules, config: seedConfig, backtest });

    expect(report.ruleCount).toBe(0);
    expect(report.signalCount).toBe(0);
    expect(report.topNumbers8).toEqual([]);
    expect(report.topNumbers12).toEqual([]);
    expect(report.topNumbers18).toEqual([]);
    expect(report.topZodiacs9).toEqual([]);
  });

  it("observes the last 10 comprehensive recommendations against realized specials", () => {
    const confirmedRules = seedRules.map((rule) => ({ ...rule, manuallyConfirmed: true }));
    const observation = buildReferenceObservation({ draws: seedDraws, rules: confirmedRules, config: seedConfig, window: 10 });

    expect(observation.total).toBeGreaterThan(0);
    expect(observation.total).toBeLessThanOrEqual(10);
    expect(observation.top8Rate).toBeGreaterThanOrEqual(0);
    expect(observation.top8Rate).toBeLessThanOrEqual(100);
    expect(observation.items[0]).toMatchObject({
      issue: expect.any(String),
      previousIssue: expect.any(String),
      special: expect.any(Number),
      zodiac: expect.any(String),
      hitTop8: expect.any(Boolean),
    });
    expect(observation.items.every((item) => item.top8Numbers.length <= 8)).toBe(true);
  });
});
