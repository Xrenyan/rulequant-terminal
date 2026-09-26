import { expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedRules } from "@/lib/data/seed";
import { createRuleObservationState, reconcileRuleObservation, type RuleObservationState } from "@/lib/rule-observation/rule-observation";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const rule: RuleRecord = { ...seedRules.find((item) => item.category === "kill_number")!, id: "audit-corrections", name: "核对更正", formula: "49", periodSpan: 1, verifyOffset: 1, enabled: true, participatesInReference: true };
const draw = (period: number, special = 49): DrawRecord => ({ issue: `2026${period}`, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special });
const update = (state: RuleObservationState, draws: DrawRecord[]) => reconcileRuleObservation(state, { draws, rules: [rule], config: defaultConfig, now: "2026-09-26T10:00:00Z" });
const activate = () => update(createRuleObservationState(), [draw(267)]);

it("refreshes a corrected observation verdict without counting that draw twice or changing the pause cause", () => {
  const state = update(activate(), [draw(267), draw(268), draw(269)]);
  expect(state.rules[rule.id].pause?.samples[0].result).toBe("failed");
  const corrected = update(state, [draw(267), draw(268), draw(269, 48)]);
  expect(corrected.rules[rule.id].pause?.causeIssue).toBe("2026268");
  expect(corrected.rules[rule.id].pause?.samples).toEqual([expect.objectContaining({ issue: "2026269", result: "passed" })]);
  expect(corrected.events.filter((event) => event.type === "paused")).toHaveLength(1);
  expect(update(corrected, [draw(267), draw(268), draw(269, 48)])).toBe(corrected);
});

it("resolves an existing unavailable observation and counts the newly repaired distinct draw without duplicate ticks", () => {
  const state = update(activate(), [draw(267), draw(268), draw(270)]);
  expect(state.rules[rule.id].pause?.samples).toEqual([{ issue: "2026270", result: "unavailable" }]);
  const corrected = update(state, [draw(267), draw(268), draw(269), draw(270)]);
  expect(corrected.rules[rule.id].pause?.samples).toEqual([expect.objectContaining({ issue: "2026269", result: "failed" }), expect.objectContaining({ issue: "2026270", calculationIssue: "2026269", result: "failed" })]);
  expect(corrected.rules[rule.id].pause?.causeIssue).toBe("2026268");
  expect(corrected.events.filter((event) => event.type === "paused")).toHaveLength(1);
  expect(update(corrected, [draw(267), draw(268), draw(269), draw(270)])).toBe(corrected);
});
