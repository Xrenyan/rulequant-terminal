import { describe, expect, it } from "vitest";
import { seedConfig, seedDraws, seedRules, seedSampleCases } from "@/lib/data/seed";
import { buildHydratedState } from "@/store/use-rulequant-store";
import type { DrawRecord } from "@/types/domain";

function draw(issue: string, special: number): DrawRecord {
  return {
    issue,
    date: "2026-07-17",
    n1: 1,
    n2: 2,
    n3: 3,
    n4: 4,
    n5: 5,
    n6: 6,
    special,
    sourceUrl: "https://example.com/draws",
  };
}

describe("store hydration draw freshness", () => {
  it("does not roll back a newer local draw when a stale mobile snapshot arrives", () => {
    const localNewest = draw("2026209", 25);
    const staleRemote = draw("2026207", 29);
    const persisted = {
      draws: [...seedDraws, localNewest],
      rules: seedRules,
      samples: seedSampleCases,
      config: seedConfig,
      logs: [],
      backups: [],
      referenceHistory: [],
    };

    const hydrated = buildHydratedState({
      persisted,
      current: { draws: persisted.draws, rules: seedRules, selectedRuleId: seedRules[0].id },
      cloud: {
        draws: [staleRemote],
        rules: seedRules,
        samples: seedSampleCases,
        config: seedConfig,
        logs: [],
        backups: [],
        referenceHistory: [],
        meta: { enabled: true, source: "github", latestIssue: staleRemote.issue, recordCount: 1 },
      },
    });

    expect(hydrated.draws.some((item) => item.issue === localNewest.issue)).toBe(true);
    expect(hydrated.draws.at(-1)?.issue).toBe(localNewest.issue);
  });

  it("keeps a friend's local formula settings when the same logic later ships from cloud", () => {
    const cloudRule = {
      ...seedRules[0],
      id: "cloud-new-rule-id",
      name: "云端同逻辑公式",
      enabled: true,
      participatesInReference: true,
      sourceType: "user_provided" as const,
      updatedAt: "2026-07-17T00:00:00.000Z",
    };
    const localRule = {
      ...seedRules[0],
      id: "friend-local-rule-id",
      name: "朋友本地已有公式",
      enabled: false,
      participatesInReference: false,
      sourceType: "manual" as const,
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const persisted = {
      draws: seedDraws,
      rules: [localRule],
      samples: seedSampleCases,
      config: seedConfig,
      logs: [],
      backups: [],
      referenceHistory: [],
    };

    const hydrated = buildHydratedState({
      persisted,
      current: { draws: seedDraws, rules: [localRule], selectedRuleId: localRule.id },
      cloud: {
        draws: seedDraws,
        rules: [cloudRule],
        samples: seedSampleCases,
        config: seedConfig,
        logs: [],
        backups: [],
        referenceHistory: [],
        meta: { enabled: true, source: "github", latestIssue: seedDraws.at(-1)?.issue, recordCount: seedDraws.length },
      },
    });

    const sameFormula = hydrated.rules.filter((rule) => rule.formula === localRule.formula && rule.category === localRule.category);
    expect(sameFormula).toHaveLength(1);
    expect(sameFormula[0]).toMatchObject({
      id: localRule.id,
      enabled: false,
      participatesInReference: false,
    });
  });

  it("updates a same-id cloud formula without resetting a friend's local switches", () => {
    const original = seedRules[0];
    const localRule = {
      ...original,
      enabled: false,
      participatesInReference: false,
      manuallyConfirmed: true,
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const cloudRule = {
      ...original,
      formula: `${original.formula} + 1`,
      updatedAt: "2026-07-17T00:00:00.000Z",
    };
    const persisted = {
      draws: seedDraws,
      rules: [localRule],
      samples: seedSampleCases,
      config: seedConfig,
      logs: [],
      backups: [],
      referenceHistory: [],
    };

    const hydrated = buildHydratedState({
      persisted,
      current: { draws: seedDraws, rules: [localRule], selectedRuleId: localRule.id },
      cloud: {
        draws: seedDraws,
        rules: [cloudRule],
        samples: seedSampleCases,
        config: seedConfig,
        logs: [],
        backups: [],
        referenceHistory: [],
        meta: { enabled: true, source: "github", latestIssue: seedDraws.at(-1)?.issue, recordCount: seedDraws.length },
      },
    });

    expect(hydrated.rules.find((rule) => rule.id === original.id)).toMatchObject({
      formula: cloudRule.formula,
      enabled: false,
      participatesInReference: false,
      manuallyConfirmed: true,
    });
  });

  it("keeps one rule when a friend's local formula uses an equivalent alias", () => {
    const cloudRule = {
      ...seedRules[0],
      id: "cloud-alias-rule",
      formula: "平1尾 + 特码合 + 期尾",
      sourceType: "user_provided" as const,
    };
    const localRule = {
      ...cloudRule,
      id: "friend-alias-rule",
      name: "朋友本地同义写法",
      formula: "尾(落1) + 特号合 + 期数尾",
      sourceType: "manual" as const,
      enabled: false,
      participatesInReference: false,
    };
    const persisted = {
      draws: seedDraws,
      rules: [localRule],
      samples: seedSampleCases,
      config: seedConfig,
      logs: [],
      backups: [],
      referenceHistory: [],
    };

    const hydrated = buildHydratedState({
      persisted,
      current: { draws: seedDraws, rules: [localRule], selectedRuleId: localRule.id },
      cloud: {
        draws: seedDraws,
        rules: [cloudRule],
        samples: seedSampleCases,
        config: seedConfig,
        logs: [],
        backups: [],
        referenceHistory: [],
        meta: { enabled: true, source: "github", latestIssue: seedDraws.at(-1)?.issue, recordCount: seedDraws.length },
      },
    });

    const equivalentRules = hydrated.rules.filter((rule) => [cloudRule.id, localRule.id].includes(rule.id));
    expect(equivalentRules).toHaveLength(1);
    expect(equivalentRules[0]).toMatchObject({ id: localRule.id, enabled: false, participatesInReference: false });
  });

  it("does not let a local system recommendation replace the same user-provided formula", () => {
    const cloudRule = {
      ...seedRules[0],
      id: "cloud-user-rule",
      sourceType: "user_provided" as const,
      enabled: true,
      participatesInReference: true,
    };
    const localRule = {
      ...cloudRule,
      id: "friend-system-rule",
      sourceType: "system_recommended" as const,
      enabled: false,
      participatesInReference: false,
      updatedAt: "2026-07-17T10:00:00.000Z",
    };
    const persisted = {
      draws: seedDraws,
      rules: [localRule],
      samples: seedSampleCases,
      config: seedConfig,
      logs: [],
      backups: [],
      referenceHistory: [],
    };

    const hydrated = buildHydratedState({
      persisted,
      current: { draws: seedDraws, rules: [localRule], selectedRuleId: localRule.id },
      cloud: {
        draws: seedDraws,
        rules: [cloudRule],
        samples: seedSampleCases,
        config: seedConfig,
        logs: [],
        backups: [],
        referenceHistory: [],
        meta: { enabled: true, source: "github", latestIssue: seedDraws.at(-1)?.issue, recordCount: seedDraws.length },
      },
    });

    const surviving = hydrated.rules.find((rule) => [cloudRule.id, localRule.id].includes(rule.id));
    expect(surviving).toMatchObject({
      id: cloudRule.id,
      sourceType: "user_provided",
      enabled: false,
      participatesInReference: false,
    });
  });
});
