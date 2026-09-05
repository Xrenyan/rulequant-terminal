import { describe, expect, it } from "vitest";
import { parseFormulaGroups, saveFormulaGroup } from "@/lib/candidate-pool/formula-groups";
import { collapseIdenticalRuleOutputs } from "@/lib/candidate-pool/signal-output-groups";
import { compareFormulaGroups } from "@/lib/candidate-pool/group-comparison";
import { generateCandidatePool } from "@/lib/candidate-pool/candidate-pool";
import { seedConfig as config, seedDraws as draws, seedRules } from "@/lib/data/seed";
import type { RuleSignal } from "@/types/domain";

const rules = seedRules.map((rule) => ({ ...rule, manuallyConfirmed: true }));
describe("saved formula groups", () => {
  it("round-trips unique IDs, replaces the selected group and rejects unusable saves", () => {
    const group = { id: "g", name: "  常用杀肖  ", ruleIds: ["a", "a", "b"], updatedAt: "now" };
    const stored = saveFormulaGroup([], group);
    expect(parseFormulaGroups(JSON.stringify(stored))).toEqual([{ ...group, name: "常用杀肖", ruleIds: ["a", "b"] }]);
    expect(saveFormulaGroup(stored, { ...group, name: "改名" })).toHaveLength(1);
    expect(() => saveFormulaGroup([], { ...group, name: " " })).toThrow();
    expect(() => saveFormulaGroup([], { ...group, ruleIds: [] })).toThrow();
    expect(parseFormulaGroups("broken")).toEqual([]);
    expect(parseFormulaGroups(JSON.stringify([{ id: "bad", name: "", ruleIds: ["a"] }]))).toEqual([]);
  });
});
describe("advisory duplicate-output comparison", () => {
  const report = generateCandidatePool({ draws, rules, config, cache: false });
  const source = report.signals.find((signal) => signal.action === "include")!;
  it("groups normalized exact outputs with mean influence without mutating originals", () => {
    const copy: RuleSignal = { ...source, ruleId: "copy", targets: [...source.targets].reverse().concat(source.targets[0]), weight: source.weight * 3 };
    const sourceRule = rules.find((r) => r.id === source.ruleId)!;
    const result = collapseIdenticalRuleOutputs([source, copy], [sourceRule, { ...sourceRule, id: "copy" }]);
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBeCloseTo(source.weight * 2);
    expect(source.weight).not.toBe(result[0].weight);
    expect(copy.targets).toHaveLength(source.targets.length + 1);
  });
  it("keeps dual outputs together and different verification periods separate", () => {
    const dual = report.signals.filter((s) => s.ruleId === "rq-kill-three-as-nine");
    expect(dual).toHaveLength(2);
    const r = rules.find((r) => r.id === "rq-kill-three-as-nine")!;
    const copied = dual.map((s) => ({ ...s, ruleId: "copy" }));
    expect(collapseIdenticalRuleOutputs([...dual, ...copied], [r, { ...r, id: "copy" }])).toHaveLength(2);
    expect(collapseIdenticalRuleOutputs([...dual, ...copied], [r, { ...r, id: "copy", verifyOffset: 2 }])).toHaveLength(4);
  });
});
describe("same-period group comparison", () => {
  const input = { draws, rules, config, window: 10, selectedRuleIds: [rules[0].id], mode: "group" as const };
  it("does not interpret an empty or unavailable selection as all formulas", () => {
    expect(() => compareFormulaGroups({ ...input, selectedRuleIds: [] })).toThrow();
    expect(() => compareFormulaGroups({ ...input, selectedRuleIds: ["deleted"] })).toThrow();
  });
  it("counts only equal common periods with two usable results", () => {
    const result = compareFormulaGroups(input);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.all.total).toBe(result.selected.total);
    expect(result.all.total).toBe(result.rows.length);
    expect(result.rows.every((row) => row.all.issue === row.selected.issue && row.all.ruleCount > 0 && row.selected.ruleCount > 0)).toBe(true);
    expect(result.selected.top8).toBe(result.rows.filter((row) => row.selected.hitTop8).length);
  });
  it("does not use the final draw's result to select that period's candidate numbers", () => {
    const before = compareFormulaGroups(input);
    const after = compareFormulaGroups({ ...input, draws: [...draws.slice(0, -1), { ...draws.at(-1)!, special: draws.at(-1)!.special === 49 ? 48 : 49 }] });
    expect(after.rows.at(-1)!.selected.top8Numbers).toEqual(before.rows.at(-1)!.selected.top8Numbers);
    expect(after.rows.at(-1)!.all.top8Numbers).toEqual(before.rows.at(-1)!.all.top8Numbers);
  });
  it("normalizes shared 10 through 200 range on its public entry", () => {
    expect(compareFormulaGroups({ ...input, window: Number.NaN }).window).toBe(10);
    expect(compareFormulaGroups({ ...input, window: 999 }).window).toBe(200);
    expect(compareFormulaGroups({ ...input, window: 27 }).window).toBe(30);
  });
});
