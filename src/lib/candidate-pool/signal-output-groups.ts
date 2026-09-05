import type { RuleRecord, RuleSignal } from "@/types/domain";

function signalKey(signal: RuleSignal): string {
  return JSON.stringify([signal.action, signal.targetType, [...new Set(signal.targets.map(String))].sort()]);
}

/** Advisory comparison only. Keep complementary outputs together as one formula. */
export function collapseIdenticalRuleOutputs(signals: RuleSignal[], rules: RuleRecord[]): RuleSignal[] {
  const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));
  const byRule = new Map<string, Map<string, RuleSignal>>();
  for (const signal of signals) {
    const outputs = byRule.get(signal.ruleId) ?? new Map<string, RuleSignal>();
    outputs.set(signalKey(signal), signal);
    byRule.set(signal.ruleId, outputs);
  }
  const groups = new Map<string, Array<Map<string, RuleSignal>>>();
  for (const [ruleId, outputs] of [...byRule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rule = ruleMap.get(ruleId);
    const key = JSON.stringify([
      rule?.category ?? ruleId, rule?.verifyMode, rule?.verifyOffset ?? 1, rule?.periodSpan ?? 1,
      [...outputs.keys()].sort(),
    ]);
    const group = groups.get(key) ?? [];
    group.push(outputs);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => [...group[0].entries()].map(([key, first]) => {
    const meanWeight = group.reduce((sum, outputs) => sum + outputs.get(key)!.weight, 0) / group.length;
    return { ...first, weight: meanWeight, scoreDelta: first.action === "include" ? meanWeight : -meanWeight };
  }));
}
