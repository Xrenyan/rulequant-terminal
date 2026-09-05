import { describe, expect, it } from "vitest";
import { defaultConfig as config } from "@/lib/config/default-config";
import { normalizeDraw } from "@/lib/engine/attributes";
import { checkRuleSuccess } from "@/lib/formula-engine/formula-engine";
import { formulaObservationVersionKey, updateFormulaObservation } from "@/lib/formula-observation/formula-observation";
import type { DrawRecord, RuleRecord } from "@/types/domain";

const rule: RuleRecord = { id: "observed", name: "记录公式", category: "kill_tail", formula: "1", normalizer: "auto", target: "next_special", verifyMode: "next_special", orderMode: "L", enabled: true, periodSpan: 1, positionPattern: [], tags: [], description: "", sourceFile: "test", examples: [], createdAt: "", updatedAt: "" };
const draw = (n: number, special = 14): DrawRecord => ({ issue: String(1000 + n), date: "2026-09-05", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special });
const at = "2026-09-05T01:00:00Z";

describe("prospective formula observation", () => {
  it("refuses stale or undated data as a supposedly new pre-draw record", () => {
    for (const date of ["2026-08-01", undefined]) {
      const captured = updateFormulaObservation({ rule, config, draws: [{ ...draw(0), date }], now: at, capture: true });
      expect(captured.predictions).toHaveLength(0);
      expect(captured.captureError).toBeTruthy();
    }
  });
  it("captures only the latest unseen future result, never already known history", () => {
    const first = updateFormulaObservation({ rule, config, draws: [draw(0), draw(1), draw(2)], now: at, capture: true });
    expect(first.predictions).toHaveLength(1);
    expect(first.predictions[0]).toMatchObject({ baseIssue: "1002", capturedAt: at });
    expect(first.predictions[0].success).toBeUndefined();
    expect(updateFormulaObservation({ previous: first, rule, config, draws: [draw(0), draw(1), draw(2)], now: at, capture: true })).toBe(first);
  });
  it("resolves using frozen output and does not rewrite a resolved outcome", () => {
    const first = updateFormulaObservation({ rule, config, draws: [draw(0)], now: at, capture: true });
    const next = updateFormulaObservation({ previous: first, rule, config, draws: [draw(0), draw(1, 11)], now: at, capture: true });
    expect(next.predictions[0]).toMatchObject({ success: false, checkedIssues: ["1001"], specials: [11] });
    expect(next.predictions[1].success).toBeUndefined();
    const corrected = updateFormulaObservation({ previous: next, rule, config, draws: [draw(0), draw(1, 14)], now: at, capture: false });
    expect(corrected.predictions[0].success).toBe(false);
  });
  it("waits for missing issues and matches ordinary offset versus all-period rules", () => {
    const offsetRule = { ...rule, periodSpan: 2, verifyOffset: 2 };
    const first = updateFormulaObservation({ rule: offsetRule, config, draws: [draw(0)], now: at, capture: true });
    const unresolved = updateFormulaObservation({ previous: first, rule: offsetRule, config, draws: [draw(0), draw(2)], now: at, capture: false });
    expect(unresolved.predictions[0].success).toBeUndefined();
    const next = updateFormulaObservation({ previous: first, rule: offsetRule, config, draws: [draw(0), draw(1, 11), draw(2, 14)], now: at, capture: false });
    expect(next.predictions[0]).toMatchObject({ success: true, checkedIssues: ["1002"] });
    const multi = { ...rule, category: "eight_zodiac_two_period" as const, periodSpan: 2 };
    const captured = updateFormulaObservation({ rule: multi, config, draws: [draw(0)], now: at, capture: true });
    const resolved = updateFormulaObservation({ previous: captured, rule: multi, config, draws: [draw(0), draw(1, 11), draw(2, 14)], now: at, capture: false });
    expect(resolved.predictions[0].success).toBe([draw(1, 11), draw(2, 14)].every((future) => checkRuleSuccess(multi, captured.predictions[0].calculation, normalizeDraw(future, config))));
    expect(resolved.predictions[0].checkedIssues).toEqual(["1001", "1002"]);
  });
  it("separates formula versions and does not change identity for a cosmetic rename", () => {
    const first = updateFormulaObservation({ rule, config, draws: [draw(0)], now: at, capture: true });
    const changed = { ...rule, formula: "2" };
    expect(formulaObservationVersionKey({ ...rule, name: "新名字" }, config)).toBe(first.id);
    expect(() => updateFormulaObservation({ previous: first, rule: changed, config, draws: [draw(0)], now: at, capture: true })).toThrow("版本");
    const next = updateFormulaObservation({ rule: changed, config, draws: [draw(0), draw(1)], now: at, capture: true });
    expect(next.predictions).toHaveLength(1);
    expect(next.predictions[0].baseIssue).toBe("1001");
    expect(first.predictions[0].baseIssue).toBe("1000");
  });
  it("does not record an older issue after replacing data with a shorter history", () => {
    const first = updateFormulaObservation({ rule, config, draws: [draw(0), draw(1), draw(2)], now: at, capture: true });
    const rollback = updateFormulaObservation({ previous: first, rule, config, draws: [draw(0)], now: at, capture: true });
    expect(rollback.predictions.map((p) => p.baseIssue)).toEqual(["1002"]);
  });
  it("bounds stored records without silently deleting earlier observations", () => {
    const first = updateFormulaObservation({ rule, config, draws: [draw(0)], now: at, capture: true });
    const previous = { ...first, predictions: Array.from({ length: 2000 }, (_, n) => ({ ...first.predictions[0], baseIssue: String(n + 1000), success: true })) };
    const full = updateFormulaObservation({ previous, rule, config, draws: [draw(2000)], now: at, capture: true });
    expect(full.predictions).toHaveLength(2000);
    expect(full.captureError).toContain("2000");
    expect(full.predictions[0].baseIssue).toBe("1000");
  });
  it("remembers later data even when capture was paused", () => {
    const first = updateFormulaObservation({ rule, config, draws: [draw(0)], now: at, capture: true });
    const paused = updateFormulaObservation({ previous: first, rule, config, draws: [draw(0), draw(1), draw(2), draw(3)], now: at, capture: false });
    const rollback = updateFormulaObservation({ previous: paused, rule, config, draws: [draw(0), draw(1), draw(2)], now: at, capture: true });
    expect(rollback.predictions).toHaveLength(1);
  });
});
