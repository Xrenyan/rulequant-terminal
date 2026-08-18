import { describe, expect, it } from "vitest";
import { buildDataHealthReport } from "@/lib/formula-analysis/data-health";
import { defaultConfig } from "@/lib/config/default-config";
import type { DrawRecord, RuleRecord } from "@/types/domain";

function draw(issue: string, special = 7): DrawRecord {
  return { issue, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special };
}

function rule(id: string): RuleRecord {
  return {
    id,
    name: id,
    category: "kill_zodiac",
    formula: "平1",
    enabled: true,
    orderMode: "L",
    normalizer: "auto",
    target: "next_special",
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    tags: [],
    description: "",
    sourceFile: "health-test",
    examples: [],
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("formula analysis data health", () => {
  it("separates identical duplicate records from conflicting issues", () => {
    const first = draw("2026101", 7);
    const report = buildDataHealthReport({
      draws: [first, { ...first }, draw("2026102", 8), draw("2026102", 9)],
      rules: [rule("r1")],
      config: defaultConfig,
      source: { label: "网站/云端", updatedAt: "2026-08-18T08:00:00.000Z" },
      now: "2026-08-18T10:00:00.000Z",
    });

    expect(report.recordCount).toBe(2);
    expect(report.latestIssue).toBe("2026102");
    expect(report.identicalDuplicateCount).toBe(1);
    expect(report.conflictingIssues).toEqual(["2026102"]);
    expect(report.status).toBe("attention");
  });

  it("reports invalid draw fields, config errors and formula errors without throwing", () => {
    const invalidConfig = {
      ...defaultConfig,
      zodiacOrder: [...defaultConfig.zodiacOrder.slice(0, 11), defaultConfig.zodiacOrder[0]],
    };
    const report = buildDataHealthReport({
      draws: [
        draw("2026201"),
        { issue: "2026202", n1: 1, n2: 1, n3: 3, n4: 4, n5: 5, n6: 6, special: 50 },
      ],
      rules: [rule("r1"), rule("r2")],
      config: invalidConfig,
      formulaErrors: [{ ruleId: "r2", ruleName: "r2", message: "公式无法计算" }],
      source: { label: "本地", updatedAt: "2026-08-18T09:30:00.000Z" },
      now: "2026-08-18T10:00:00.000Z",
    });

    expect(report.invalidDraws).toEqual([{
      issue: "2026202",
      errors: ["号码必须是 1-49 的整数", "同一期的 7 个号码不能重复"],
    }]);
    expect(report.configErrors[0]).toContain("生肖顺序");
    expect(report.formulaErrors).toEqual([{ ruleId: "r2", ruleName: "r2", message: "公式无法计算" }]);
    expect(report.enabledRuleCount).toBe(2);
    expect(report.status).toBe("attention");
  });

  it("distinguishes fresh, stale, partial and offline source states", () => {
    const base = {
      draws: [draw("2026301")],
      rules: [rule("r1")],
      config: defaultConfig,
      now: "2026-08-18T10:00:00.000Z",
    };

    expect(buildDataHealthReport({
      ...base,
      source: { label: "云端", updatedAt: "2026-08-18T09:00:00.000Z" },
    }).freshness).toBe("fresh");
    expect(buildDataHealthReport({
      ...base,
      source: { label: "云端", updatedAt: "2026-08-16T00:00:00.000Z" },
    })).toMatchObject({ freshness: "stale", status: "attention" });
    expect(buildDataHealthReport({
      ...base,
      source: { label: "静态快照", partial: true },
    }).status).toBe("partial");
    expect(buildDataHealthReport({
      ...base,
      source: { label: "最后可用数据", offline: true },
    }).status).toBe("offline");
  });

  it("keeps issue-gap status unknown when the source has no authoritative sequence", () => {
    const report = buildDataHealthReport({
      draws: [draw("2026401"), draw("2026403")],
      rules: [],
      config: defaultConfig,
      source: { label: "人工数据" },
      now: "2026-08-18T10:00:00.000Z",
    });

    expect(report.missingIssueStatus).toBe("unknown");
    expect(report.missingIssues).toEqual([]);
  });
});
