import type { CandidateNumber, CandidatePoolReport, CandidateZodiac, ReferenceHistoryItem, RuleQuantConfig } from "@/types/domain";

export type RankChange = { previousIssue: string; currentRank: number; previousRank: number; movement: number;
  changes: Array<{ ruleId: string; name: string; delta: number; kind: "added" | "removed" | "changed" }> };
type ScoredEvidence = { ruleId: string; ruleName: string; scoreDelta: number };

function evidenceScores(numbers: Array<{ supportEvidence?: ScoredEvidence[]; opposeEvidence?: ScoredEvidence[] }>) {
  const scores = new Map<string, { name: string; score: number }>();
  for (const number of numbers) for (const item of [...(number.supportEvidence ?? []), ...(number.opposeEvidence ?? [])]) {
    const previous = scores.get(item.ruleId);
    scores.set(item.ruleId, { name: item.ruleName, score: (previous?.score ?? 0) + item.scoreDelta / numbers.length });
  }
  return scores;
}

export function explainRankChange(report: CandidatePoolReport, candidate: CandidateNumber | CandidateZodiac, history: ReferenceHistoryItem[], config: RuleQuantConfig): RankChange | undefined {
  if (!report.latestIssue) return undefined;
  const configKey = JSON.stringify(config);
  const previous = history.filter((item) => item.baseIssue && item.baseIssue.localeCompare(report.latestIssue!, "zh-CN", { numeric: true }) < 0
    && item.analysisConfigKey === configKey && item.allNumbers.length === 49 && item.allZodiacs.length === 12)
    .sort((a, b) => b.baseIssue!.localeCompare(a.baseIssue!, "zh-CN", { numeric: true }) || b.savedAt.localeCompare(a.savedAt))[0];
  if (!previous) return undefined;
  const number = "number" in candidate;
  const currentRank = number ? report.allNumbers.findIndex((item) => item.number === candidate.number) + 1 : report.allZodiacs.findIndex((item) => item.zodiac === candidate.zodiac) + 1;
  const previousRank = number ? previous.allNumbers.findIndex((item) => item.number === candidate.number) + 1 : previous.allZodiacs.findIndex((item) => item.zodiac === candidate.zodiac) + 1;
  if (!currentRank || !previousRank) return undefined;
  const currentNumbers = number ? [candidate] : report.allNumbers.filter((item) => item.zodiac === candidate.zodiac);
  const pastNumbers = number ? previous.allNumbers.filter((item) => item.number === candidate.number) : previous.allNumbers.filter((item) => item.zodiac === candidate.zodiac);
  if (pastNumbers.some((item) => !item.supportEvidence || !item.opposeEvidence)) return undefined;
  const after = evidenceScores(currentNumbers.map((item) => ({ supportEvidence: item.supportRules, opposeEvidence: item.opposeRules })));
  const before = evidenceScores(pastNumbers);
  const changes = [...new Set([...after.keys(), ...before.keys()])].flatMap((ruleId) => {
    const a = after.get(ruleId), b = before.get(ruleId);
    const delta = (a?.score ?? 0) - (b?.score ?? 0);
    return Math.abs(delta) < 0.00001 ? [] : [{ ruleId, name: a?.name ?? b!.name, delta, kind: (!b ? "added" : !a ? "removed" : "changed") as "added" | "removed" | "changed" }];
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.ruleId.localeCompare(b.ruleId));
  return { previousIssue: previous.baseIssue!, currentRank, previousRank, movement: previousRank - currentRank, changes };
}
