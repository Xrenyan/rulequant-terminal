import { getNumberAttributes } from "@/lib/engine/attributes";
import type {
  CandidateNumber,
  CandidatePoolReport,
  CandidateZodiac,
  DrawRecord,
  ReferenceHistoryEvidence,
  ReferenceHistoryEvidenceSummary,
  ReferenceHistoryItem,
  ReferenceHistoryNumber,
  ReferenceHistoryOutcome,
  ReferenceHistoryZodiac,
  RuleQuantConfig,
  RuleSignal,
} from "@/types/domain";

export type ResolvedReferenceHistoryItem = ReferenceHistoryItem & {
  actualNextIssue?: string;
  actualSpecial?: number;
  actualZodiac?: string;
  hitTop8?: boolean;
  hitTop12?: boolean;
  hitTop18?: boolean;
  hitZodiac7?: boolean;
  hitZodiac9?: boolean;
};

type BuildReferenceHistoryOptions = {
  report: CandidatePoolReport;
  saveType: "auto" | "manual";
  dataSourceLabel: string;
  recordCount: number;
  note?: string;
};

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function sortDrawRecords(records: DrawRecord[]) {
  return [...records].sort((a, b) => {
    const aNumber = /^\d+$/.test(a.issue) ? Number(a.issue) : undefined;
    const bNumber = /^\d+$/.test(b.issue) ? Number(b.issue) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) return aNumber - bNumber;
    if (aNumber !== undefined) return 1;
    if (bNumber !== undefined) return -1;
    return a.issue.localeCompare(b.issue, "zh-CN", { numeric: true });
  });
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function referenceHistorySignature(report: CandidatePoolReport) {
  return JSON.stringify({
    issue: report.latestIssue,
    latestNumbers: report.latestNumbers,
    ruleCount: report.ruleCount,
    signalCount: report.signalCount,
    top8: report.topNumbers8.map((item) => item.number),
    top18: report.topNumbers18.map((item) => item.number),
    z9: report.topZodiacs9.map((item) => item.zodiac),
  });
}

function ruleNames(items: CandidateNumber["supportRules"]) {
  return items.map((item) => item.ruleName);
}

function compactCandidateEvidence(item: CandidateNumber["supportRules"][number]): ReferenceHistoryEvidence {
  return {
    ruleId: item.ruleId,
    ruleName: item.ruleName,
    category: item.category,
    action: item.action,
    targetType: item.targetType,
    targets: item.targets,
    weight: item.weight,
    scoreDelta: item.scoreDelta,
    successRate: item.successRate,
    recentRate: item.recentRate,
    currentStreak: item.currentStreak,
    wrongStreak: item.wrongStreak,
    formula: item.formula,
    process: item.process.slice(0, 8),
    sourceType: item.sourceType,
  };
}

function compactHistoryNumber(item: CandidateNumber, rank: number): ReferenceHistoryNumber {
  return {
    rank,
    number: item.number,
    zodiac: item.zodiac,
    score: item.score,
    supportCount: item.supportCount,
    opposeCount: item.opposeCount,
    inTop8: rank <= 8,
    inTop12: rank <= 12,
    inTop16: rank <= 16,
    inTop18: rank <= 18,
    supportRuleNames: ruleNames(item.supportRules),
    opposeRuleNames: ruleNames(item.opposeRules),
    color: item.color,
    element: item.element,
    tail: item.tail,
    sum: item.sum,
    segment: item.segment,
    supportEvidence: item.supportRules.map(compactCandidateEvidence),
    opposeEvidence: item.opposeRules.map(compactCandidateEvidence),
  };
}

function compactHistoryZodiac(item: CandidateZodiac, rank: number): ReferenceHistoryZodiac {
  return {
    rank,
    zodiac: item.zodiac,
    score: item.score,
    numbers: item.numbers.map((number) => ({ number: number.number, zodiac: number.zodiac })),
    supportCount: item.supportCount,
    opposeCount: item.opposeCount,
    inTop7: rank <= 7,
    inTop8: rank <= 8,
    inTop9: rank <= 9,
    supportRuleNames: ruleNames(item.supportRules),
    opposeRuleNames: ruleNames(item.opposeRules),
    supportEvidence: item.supportRules.map(compactCandidateEvidence),
    opposeEvidence: item.opposeRules.map(compactCandidateEvidence),
  };
}

function evidenceFromSignal(signal: RuleSignal): ReferenceHistoryEvidenceSummary {
  return {
    ruleId: signal.ruleId,
    ruleName: signal.ruleName,
    category: signal.category,
    action: signal.action,
    targetType: signal.targetType,
    targets: signal.targets,
    weight: signal.weight,
    scoreDelta: signal.scoreDelta,
    successRate: signal.successRate,
    recentRate: signal.recentRate,
    currentStreak: signal.currentStreak,
    wrongStreak: signal.wrongStreak,
    formula: signal.formula,
    process: signal.process.slice(0, 8),
    sourceType: signal.sourceType,
  };
}

export function buildReferenceHistoryItem(input: BuildReferenceHistoryOptions): ReferenceHistoryItem {
  const signature = referenceHistorySignature(input.report);
  const savedAt = new Date().toISOString();
  const allNumbers = input.report.allNumbers.map((item, index) => compactHistoryNumber(item, index + 1));
  const allZodiacs = input.report.allZodiacs.map((item, index) => compactHistoryZodiac(item, index + 1));
  const byNumber = new Map(allNumbers.map((item) => [item.number, item]));
  const byZodiac = new Map(allZodiacs.map((item) => [item.zodiac, item]));

  return {
    schemaVersion: 2,
    id: `reference-${input.report.latestIssue ?? "unknown"}-${stableHash(signature)}`,
    signature,
    generatedAt: input.report.generatedAt,
    savedAt,
    saveType: input.saveType,
    baseIssue: input.report.latestIssue,
    targetIssue: input.report.latestIssue && /^\d+$/.test(input.report.latestIssue) ? String(Number(input.report.latestIssue) + 1) : undefined,
    latestDate: input.report.latestDate,
    latestNumbers: input.report.latestNumbers,
    dataSourceLabel: input.dataSourceLabel,
    recordCount: input.recordCount,
    ruleCount: input.report.ruleCount,
    signalCount: input.report.signalCount,
    supportSignalCount: input.report.signals.filter((signal) => signal.action === "include").length,
    opposeSignalCount: input.report.signals.filter((signal) => signal.action === "exclude").length,
    topNumbers8: input.report.topNumbers8.map((item) => byNumber.get(item.number) ?? compactHistoryNumber(item, 999)),
    topNumbers12: input.report.topNumbers12.map((item) => byNumber.get(item.number) ?? compactHistoryNumber(item, 999)),
    topNumbers16: input.report.topNumbers16.map((item) => byNumber.get(item.number) ?? compactHistoryNumber(item, 999)),
    topNumbers18: input.report.topNumbers18.map((item) => byNumber.get(item.number) ?? compactHistoryNumber(item, 999)),
    topZodiacs7: input.report.topZodiacs7.map((item) => byZodiac.get(item.zodiac) ?? compactHistoryZodiac(item, 999)),
    topZodiacs8: input.report.topZodiacs8.map((item) => byZodiac.get(item.zodiac) ?? compactHistoryZodiac(item, 999)),
    topZodiacs9: input.report.topZodiacs9.map((item) => byZodiac.get(item.zodiac) ?? compactHistoryZodiac(item, 999)),
    allNumbers,
    allZodiacs,
    evidenceSummary: input.report.signals.slice(0, 120).map(evidenceFromSignal),
    note: input.note,
  };
}

function normalizeLegacyNumber(item: Partial<ReferenceHistoryNumber>, index: number): ReferenceHistoryNumber {
  const rank = item.rank ?? index + 1;
  return {
    rank,
    number: item.number ?? 0,
    zodiac: item.zodiac ?? "",
    score: item.score ?? 0,
    supportCount: item.supportCount ?? 0,
    opposeCount: item.opposeCount ?? 0,
    inTop8: item.inTop8 ?? rank <= 8,
    inTop12: item.inTop12 ?? rank <= 12,
    inTop16: item.inTop16 ?? rank <= 16,
    inTop18: item.inTop18 ?? rank <= 18,
    hit: item.hit,
    supportRuleNames: item.supportRuleNames ?? [],
    opposeRuleNames: item.opposeRuleNames ?? [],
    color: item.color,
    element: item.element,
    tail: item.tail,
    sum: item.sum,
    segment: item.segment,
    supportEvidence: item.supportEvidence ?? [],
    opposeEvidence: item.opposeEvidence ?? [],
  };
}

function normalizeLegacyZodiac(item: Partial<ReferenceHistoryZodiac>, index: number): ReferenceHistoryZodiac {
  const rank = item.rank ?? index + 1;
  return {
    rank,
    zodiac: item.zodiac ?? "",
    score: item.score ?? 0,
    numbers: item.numbers ?? [],
    supportCount: item.supportCount ?? 0,
    opposeCount: item.opposeCount ?? 0,
    inTop7: item.inTop7 ?? rank <= 7,
    inTop8: item.inTop8 ?? rank <= 8,
    inTop9: item.inTop9 ?? rank <= 9,
    hit: item.hit,
    supportRuleNames: item.supportRuleNames ?? [],
    opposeRuleNames: item.opposeRuleNames ?? [],
    supportEvidence: item.supportEvidence ?? [],
    opposeEvidence: item.opposeEvidence ?? [],
  };
}

function normalizedRecord(record: ReferenceHistoryItem): ReferenceHistoryItem {
  const topNumbers18 = (record.topNumbers18 ?? []).map(normalizeLegacyNumber);
  const topZodiacs9 = (record.topZodiacs9 ?? []).map(normalizeLegacyZodiac);
  const allNumbers = (record.allNumbers?.length ? record.allNumbers : topNumbers18).map(normalizeLegacyNumber);
  const allZodiacs = (record.allZodiacs?.length ? record.allZodiacs : topZodiacs9).map(normalizeLegacyZodiac);

  return {
    ...record,
    schemaVersion: 2,
    supportSignalCount: record.supportSignalCount ?? 0,
    opposeSignalCount: record.opposeSignalCount ?? 0,
    topNumbers8: (record.topNumbers8 ?? allNumbers.slice(0, 8)).map(normalizeLegacyNumber),
    topNumbers12: (record.topNumbers12 ?? allNumbers.slice(0, 12)).map(normalizeLegacyNumber),
    topNumbers16: (record.topNumbers16 ?? allNumbers.slice(0, 16)).map(normalizeLegacyNumber),
    topNumbers18,
    topZodiacs7: (record.topZodiacs7 ?? allZodiacs.slice(0, 7)).map(normalizeLegacyZodiac),
    topZodiacs8: (record.topZodiacs8 ?? allZodiacs.slice(0, 8)).map(normalizeLegacyZodiac),
    topZodiacs9,
    allNumbers,
    allZodiacs,
    evidenceSummary: record.evidenceSummary ?? [],
  };
}

function outcomeBand(rank?: number): ReferenceHistoryOutcome["hitBand"] {
  if (!rank) return "outside";
  if (rank <= 8) return "top8";
  if (rank <= 12) return "top9_12";
  if (rank <= 18) return "top13_18";
  return "outside";
}

export function resolveReferenceHistoryOutcomes(
  records: ReferenceHistoryItem[],
  draws: DrawRecord[],
  config: RuleQuantConfig,
): ResolvedReferenceHistoryItem[] {
  const sortedDraws = sortDrawRecords(draws);
  return records.map((inputRecord) => {
    const record = normalizedRecord(inputRecord);
    const currentIndex = sortedDraws.findIndex((draw) => draw.issue === record.baseIssue);
    const nextDraw = currentIndex >= 0 ? sortedDraws[currentIndex + 1] : undefined;
    if (!nextDraw) return record;

    const attributes = getNumberAttributes(nextDraw.special, config);
    const numberRank = record.allNumbers.find((item) => item.number === nextDraw.special)?.rank;
    const outcome: ReferenceHistoryOutcome = {
      nextIssue: nextDraw.issue,
      special: nextDraw.special,
      zodiac: attributes.zodiac,
      hitTop8: record.topNumbers8.some((item) => item.number === nextDraw.special),
      hitTop12: record.topNumbers12.some((item) => item.number === nextDraw.special),
      hitTop18: record.topNumbers18.some((item) => item.number === nextDraw.special),
      hitZodiac7: record.topZodiacs7.some((item) => item.zodiac === attributes.zodiac),
      hitZodiac9: record.topZodiacs9.some((item) => item.zodiac === attributes.zodiac),
      hitNumberRank: numberRank,
      hitBand: outcomeBand(numberRank),
      resolvedAt: new Date().toISOString(),
    };

    const allNumbers = record.allNumbers.map((item) => ({ ...item, hit: item.number === nextDraw.special }));
    const allZodiacs = record.allZodiacs.map((item) => ({ ...item, hit: item.zodiac === attributes.zodiac }));

    return {
      ...record,
      targetIssue: nextDraw.issue,
      outcome,
      allNumbers,
      allZodiacs,
      topNumbers8: record.topNumbers8.map((item) => ({ ...item, hit: item.number === nextDraw.special })),
      topNumbers12: record.topNumbers12.map((item) => ({ ...item, hit: item.number === nextDraw.special })),
      topNumbers16: record.topNumbers16.map((item) => ({ ...item, hit: item.number === nextDraw.special })),
      topNumbers18: record.topNumbers18.map((item) => ({ ...item, hit: item.number === nextDraw.special })),
      topZodiacs7: record.topZodiacs7.map((item) => ({ ...item, hit: item.zodiac === attributes.zodiac })),
      topZodiacs8: record.topZodiacs8.map((item) => ({ ...item, hit: item.zodiac === attributes.zodiac })),
      topZodiacs9: record.topZodiacs9.map((item) => ({ ...item, hit: item.zodiac === attributes.zodiac })),
      actualNextIssue: nextDraw.issue,
      actualSpecial: nextDraw.special,
      actualZodiac: attributes.zodiac,
      hitTop8: outcome.hitTop8,
      hitTop12: outcome.hitTop12,
      hitTop18: outcome.hitTop18,
      hitZodiac7: outcome.hitZodiac7,
      hitZodiac9: outcome.hitZodiac9,
    };
  });
}

export function trimReferenceHistory(records: ReferenceHistoryItem[], limit = 500): ReferenceHistoryItem[] {
  const unique = new Map<string, ReferenceHistoryItem>();
  records.forEach((record) => unique.set(record.id, normalizedRecord(record)));
  return [...unique.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, limit);
}

export function referenceHistoryNumberText(item: Pick<ReferenceHistoryNumber, "number" | "zodiac">) {
  return `${padNumber(item.number)} ${item.zodiac}`;
}
