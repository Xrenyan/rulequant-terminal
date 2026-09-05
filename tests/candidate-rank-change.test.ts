import { describe, expect, it } from "vitest";
import { generateCandidatePool } from "@/lib/candidate-pool/candidate-pool";
import { buildReferenceHistoryItem } from "@/lib/reference-history/reference-history";
import { explainRankChange } from "@/lib/reference-history/rank-change";
import { seedConfig as config, seedDraws as draws, seedRules as rules } from "@/lib/data/seed";

const report = generateCandidatePool({ draws, rules, config, cache: false });
const previous = buildReferenceHistoryItem({ report, config, saveType: "manual", dataSourceLabel: "test", recordCount: draws.length });
const next = { ...report, latestIssue: String(Number(report.latestIssue) + 1) };
describe("rank change explanation", () => {
  it("requires a strictly earlier compatible full snapshot", () => {
    const candidate = report.allNumbers[0];
    expect(explainRankChange(report, candidate, [previous], config)).toBeUndefined();
    expect(explainRankChange(next, candidate, [{ ...previous, analysisConfigKey: undefined }], config)).toBeUndefined();
    expect(explainRankChange(next, candidate, [{ ...previous, allNumbers: previous.allNumbers.slice(0, 18) }], config)).toBeUndefined();
    expect(explainRankChange(next, candidate, [previous], config)?.movement).toBe(0);
  });
  it("explains actual influence changes and full-list order, not top8's separate order", () => {
    const index = report.allNumbers.findIndex((n) => n.supportRules.length);
    const old = report.allNumbers[index];
    const source = old.supportRules[0];
    const candidate = { ...old, supportRules: [{ ...source, scoreDelta: source.scoreDelta + 2 }, ...old.supportRules.slice(1)] };
    const current = { ...next, allNumbers: [...report.allNumbers.filter((n) => n.number !== candidate.number), candidate] };
    const change = explainRankChange(current, candidate, [previous], config)!;
    expect(change.currentRank).toBe(49);
    expect(change.previousRank).toBe(index + 1);
    expect(change.changes.find((c) => c.ruleId === source.ruleId)?.delta).toBeCloseTo(2);
    expect(change.changes.find((c) => c.ruleId === source.ruleId)?.kind).toBe("changed");
  });
  it("averages the zodiac's number-level influences and reports removed contributions", () => {
    const zodiac = report.allZodiacs[0];
    const firstNumber = report.allNumbers.find((n) => n.zodiac === zodiac.zodiac && n.supportRules.length)!;
    const source = firstNumber.supportRules[0];
    const changedNumbers = report.allNumbers.map((n) => n.number === firstNumber.number ? { ...n, supportRules: n.supportRules.filter((s) => s !== source) } : n);
    const change = explainRankChange({ ...next, allNumbers: changedNumbers }, zodiac, [previous], config)!;
    expect(change.changes.find((c) => c.ruleId === source.ruleId)?.delta).toBeCloseTo(-source.scoreDelta / report.allNumbers.filter((n) => n.zodiac === zodiac.zodiac).length);
  });
});
