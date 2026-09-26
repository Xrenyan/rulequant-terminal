import { describe, expect, it } from "vitest";
import { seedConfig, seedDraws, seedRules, seedSampleCases } from "@/lib/data/seed";
import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { buildRuleSignature } from "@/lib/rules/rule-library";
import { createRuleObservationState, reconcileRuleObservation } from "@/lib/rule-observation/rule-observation";
import { buildHydratedState } from "@/store/use-rulequant-store";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const bundled = seedRules.find((rule) => rule.category === "kill_number")!;
const local = (): RuleRecord => ({ ...bundled, id: "friend-user-provided-original-id", name: "我的原有公式", sourceType: "user_provided", updatedAt: "2026-06-01T00:00:00.000Z" });
function persisted(rules: RuleRecord[], draws = seedDraws) {
  return { draws, rules, samples: seedSampleCases, config: seedConfig, logs: [], backups: [], referenceHistory: [] };
}
function cloud(rules: RuleRecord[], draws = seedDraws) {
  return { ...persisted(rules, draws), meta: { enabled: true, source: "github" as const, latestIssue: draws.at(-1)?.issue, recordCount: draws.length } };
}

describe("hydration keeps the existing identity of an equivalent user-provided rule", () => {
  it.each(["user_provided", undefined] as const)("preserves local identity, preferences and selection for source %s", (sourceType) => {
    const localRule = { ...local(), sourceType, enabled: false, participatesInReference: false, manuallyConfirmed: true };
    const remote = { ...bundled, updatedAt: "2026-09-27T00:00:00.000Z" };
    const input = { persisted: persisted([localRule]), current: { draws: seedDraws, rules: [localRule], selectedRuleId: localRule.id }, cloud: cloud([remote]) };
    const first = buildHydratedState(input);
    const second = buildHydratedState({ ...input, persisted: persisted(first.rules), current: { ...input.current, rules: first.rules } });
    for (const state of [first, second]) {
      const equivalent = state.rules.filter((rule) => buildRuleSignature(rule) === buildRuleSignature(localRule));
      expect(equivalent).toHaveLength(1);
      expect(equivalent[0]).toMatchObject({ id: localRule.id, name: localRule.name, enabled: false, participatesInReference: false, manuallyConfirmed: true });
      expect(state.selectedRuleId).toBe(localRule.id);
    }
    expect(second.rules).toHaveLength(first.rules.length);
  });

  it("keeps an existing pause through new-seed/old-cloud hydration and later equivalent cloud shipping", () => {
    const localRule = { ...local(), enabled: true, participatesInReference: true };
    const firstDraw: DrawRecord = { issue: "2026901", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 49 };
    const excluded = Number(calculateRule(localRule, normalizeDraw(firstDraw, seedConfig), seedConfig, { periodIndex: 0 }).mappedResult[0]);
    const regular = Array.from({ length: 49 }, (_, index) => index + 1).filter((number) => number !== excluded).slice(0, 6);
    const secondDraw: DrawRecord = { issue: "2026902", n1: regular[0], n2: regular[1], n3: regular[2], n4: regular[3], n5: regular[4], n6: regular[5], special: excluded };
    const draws = [firstDraw, secondDraw];
    const initial = createRuleObservationState();
    initial.settings.autoResume = false;
    const started = reconcileRuleObservation(initial, { draws: [firstDraw], rules: [localRule], config: seedConfig });
    const paused = reconcileRuleObservation(started, { draws, rules: [localRule], config: seedConfig });
    expect(paused.rules[localRule.id].pause?.causeIssue).toBe(secondDraw.issue);

    const oldCloudRules = seedRules.filter((rule) => rule.id !== bundled.id);
    const first = buildHydratedState({ persisted: persisted([localRule], draws), current: { draws, rules: [localRule], selectedRuleId: localRule.id }, cloud: cloud(oldCloudRules, draws) });
    const second = buildHydratedState({ persisted: persisted(first.rules, draws), current: { draws, rules: first.rules, selectedRuleId: localRule.id }, cloud: cloud(seedRules, draws) });
    for (const hydrated of [first, second]) {
      expect(hydrated.rules.find((rule) => buildRuleSignature(rule) === buildRuleSignature(localRule))?.id).toBe(localRule.id);
      const observation = reconcileRuleObservation(paused, { draws: hydrated.draws, rules: hydrated.rules, config: hydrated.config });
      expect(observation.settings).toEqual(paused.settings);
      expect(observation.rules[localRule.id]).toEqual(paused.rules[localRule.id]);
      expect(observation.events).toEqual(paused.events);
      expect(observation.rules[bundled.id]).toBeUndefined();
    }
  });

  it("still accepts newer same-ID mathematical revisions without changing local preferences", () => {
    const localRule = { ...local(), enabled: false, participatesInReference: false, manuallyConfirmed: true };
    const revised = { ...localRule, formula: `${localRule.formula}+9`, enabled: true, participatesInReference: true, manuallyConfirmed: false, updatedAt: "2026-09-27T00:00:00.000Z" };
    const hydrated = buildHydratedState({ persisted: persisted([localRule]), current: { draws: seedDraws, rules: [localRule], selectedRuleId: localRule.id }, cloud: cloud([revised]) });
    expect(hydrated.rules.find((rule) => rule.id === localRule.id)).toMatchObject({ formula: revised.formula, enabled: false, participatesInReference: false, manuallyConfirmed: true });
  });
});
