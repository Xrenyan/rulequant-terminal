import { describe, expect, it } from "vitest";
import { mergeManualCloudDraws, mergeUserCreatedCloudRules } from "@/lib/cloud/cloud-state";
import type { DrawRecord, OperationLog, RuleRecord } from "@/types/domain";

function draw(issue: string, sourceType?: string): DrawRecord {
  return {
    issue,
    date: "2026-06-28",
    year: 2026,
    sourceUrl: sourceType === "manual" ? "manual://user-input" : "https://example.com",
    rawAttributes: sourceType ? { sourceType } : undefined,
    n1: 1,
    n2: 2,
    n3: 3,
    n4: 4,
    n5: 5,
    n6: 6,
    special: 7,
  };
}

function rule(overrides: Partial<RuleRecord> = {}): RuleRecord {
  const now = "2026-06-28T00:00:00.000Z";
  return {
    id: "rule-base",
    name: "测试公式",
    category: "kill_zodiac",
    orderMode: "L",
    formula: "平1",
    normalizer: "auto",
    target: "special_zodiac",
    verifyMode: "next_special",
    positionPattern: [],
    periodSpan: 1,
    enabled: true,
    participatesInReference: true,
    sourceType: "user_provided",
    tags: [],
    description: "",
    sourceFile: "test",
    examples: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("cloud state merge guards", () => {
  it("keeps existing manual draw records when publishing website draws", () => {
    const merged = mergeManualCloudDraws({
      incomingDraws: [draw("2026178")],
      currentDraws: [draw("manual-20260628170000", "manual")],
      logs: [],
    });

    expect(merged.map((item) => item.issue)).toEqual(["2026178", "manual-20260628170000"]);
  });

  it("allows explicit manual draw deletion to stay deleted", () => {
    const logs: OperationLog[] = [{
      id: "log-delete",
      timestamp: "2026-06-28T00:00:00.000Z",
      type: "sync_draws",
      message: "删除开奖数据：manual-1（人工录入）",
      issue: "manual-1",
      details: { sourceType: "manual" },
    }];

    const merged = mergeManualCloudDraws({
      incomingDraws: [draw("2026178")],
      currentDraws: [draw("manual-1", "manual")],
      logs,
    });

    expect(merged.map((item) => item.issue)).toEqual(["2026178"]);
  });

  it("keeps user-created rules when publishing canonical cloud rules", () => {
    const merged = mergeUserCreatedCloudRules({
      incomingRules: [rule({ id: "builtin-rule", sourceType: "user_provided" })],
      currentRules: [
        rule({ id: "manual-rule", sourceType: "manual", name: "人工新增公式" }),
        rule({ id: "txt-rule", sourceType: "txt_import", name: "TXT 公式" }),
      ],
      logs: [],
    });

    expect(merged.map((item) => item.id)).toEqual(["builtin-rule", "manual-rule", "txt-rule"]);
    expect(merged.find((item) => item.id === "manual-rule")?.participatesInReference).toBe(true);
  });

  it("allows explicit user-created rule deletion to stay deleted", () => {
    const logs: OperationLog[] = [{
      id: "log-delete-rule",
      timestamp: "2026-06-28T00:00:00.000Z",
      type: "rule_deleted",
      message: "删除公式：人工新增公式",
      ruleId: "manual-rule",
    }];

    const merged = mergeUserCreatedCloudRules({
      incomingRules: [rule({ id: "builtin-rule", sourceType: "user_provided" })],
      currentRules: [rule({ id: "manual-rule", sourceType: "manual", name: "人工新增公式" })],
      logs,
    });

    expect(merged.map((item) => item.id)).toEqual(["builtin-rule"]);
  });
});
