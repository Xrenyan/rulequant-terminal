import { describe, expect, it } from "vitest";
import { addRuleToLibrary, addRulesToLibrary, buildRuleSignature, normalizeRuleDraft } from "@/lib/rules/rule-library";
import { canRuleParticipateInReference } from "@/lib/rules/rule-validation";
import type { RuleRecord } from "@/types/domain";

function baseRule(overrides: Partial<RuleRecord> = {}): RuleRecord {
  const now = "2026-06-27T00:00:00.000Z";
  return {
    id: "rule-base",
    name: "基础规则",
    category: "kill_zodiac",
    orderMode: "L",
    formula: "平1 + 特码尾",
    normalizer: "subtract_48_to_1_49",
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

describe("rule library unified add flow", () => {
  it("turns a system recommended candidate into a formal enabled rule", () => {
    const candidate = baseRule({
      id: "auto-candidate-1",
      sourceType: "system_recommended",
      enabled: false,
      participatesInReference: false,
    });

    const result = addRuleToLibrary({
      existingRules: [],
      draft: {
        ...candidate,
        id: undefined,
        enabled: true,
        participatesInReference: true,
        manuallyConfirmed: true,
        fromCandidateId: candidate.id,
      },
      now: "2026-06-27T12:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule.id).not.toBe(candidate.id);
    expect(result.rule.sourceType).toBe("system_recommended");
    expect(result.rule.fromCandidateId).toBe("auto-candidate-1");
    expect(result.rule.enabled).toBe(true);
    expect(result.rule.participatesInReference).toBe(true);
    expect(canRuleParticipateInReference(result.rule)).toBe(true);
  });

  it("does not add the same recommendation twice", () => {
    const existing = normalizeRuleDraft(baseRule({ sourceType: "system_recommended" }), { forceNewId: false });
    const result = addRuleToLibrary({
      existingRules: [existing],
      draft: {
        ...existing,
        id: undefined,
        fromCandidateId: "auto-candidate-1",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.duplicate?.id).toBe(existing.id);
    expect(result.reason).toContain("已存在");
  });

  it("adds TXT parsed rules through the same library flow", () => {
    const draft = baseRule({
      id: "txt-temp-1",
      name: "TXT 规则",
      sourceType: "txt_import",
      origin: "test.txt",
      fromTextId: "test.txt",
    });

    const result = addRulesToLibrary([], [draft], { now: "2026-06-27T12:00:00.000Z" });

    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({
      sourceType: "txt_import",
      origin: "test.txt",
      enabled: true,
      participatesInReference: true,
      parseStatus: "parsed",
      verifyStatus: "unchecked",
    });
  });

  it("allows explicit copied rules without overwriting the original", () => {
    const original = normalizeRuleDraft(baseRule(), { forceNewId: false });
    const result = addRuleToLibrary({
      existingRules: [original],
      draft: {
        ...original,
        id: undefined,
        name: `${original.name} 副本`,
        sourceType: "copied",
        origin: original.id,
      },
      allowDuplicate: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toHaveLength(2);
    expect(result.rule.id).not.toBe(original.id);
    expect(result.rule.origin).toBe(original.id);
    expect(buildRuleSignature(result.rule)).toBe(buildRuleSignature(original));
  });
});
