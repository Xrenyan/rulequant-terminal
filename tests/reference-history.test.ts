import { describe, expect, test } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { getNumberAttributes } from "@/lib/engine/attributes";
import {
  buildReferenceHistoryItem,
  referenceHistorySignature,
  resolveReferenceHistoryOutcomes,
  trimReferenceHistory,
} from "@/lib/reference-history/reference-history";
import type { CandidateEvidence, CandidateNumber, CandidatePoolReport, CandidateZodiac, DrawRecord, ReferenceHistoryItem, RuleSignal } from "@/types/domain";

function evidence(name = "测试公式"): CandidateEvidence {
  return {
    ruleId: `rule-${name}`,
    ruleName: name,
    category: "include_zodiac",
    action: "include",
    targetType: "number",
    targets: [1],
    weight: 1,
    scoreDelta: 1,
    successRate: 88,
    recentRate: 80,
    currentStreak: 3,
    formula: "平1",
    process: ["测试过程"],
    sourceType: "user_provided",
  };
}

function numberCandidate(number: number, score: number): CandidateNumber {
  return {
    ...getNumberAttributes(number, defaultConfig),
    score,
    supportCount: 1,
    opposeCount: 0,
    supportRules: [evidence(`支持${number}`)],
    opposeRules: [],
  };
}

function buildAllNumbers(special: number, rank: number): CandidateNumber[] {
  const others = Array.from({ length: 49 }, (_, index) => index + 1)
    .filter((number) => number !== special)
    .map((number, index) => numberCandidate(number, 100 - index));
  const target = numberCandidate(special, 200);
  const list = [...others.slice(0, rank - 1), target, ...others.slice(rank - 1)];
  return list.map((item, index) => ({ ...item, score: 1000 - index }));
}

function buildAllZodiacs(numbers: CandidateNumber[], winningZodiac: string, rank: number): CandidateZodiac[] {
  const zodiacs = defaultConfig.zodiacOrder.filter((zodiac) => zodiac !== winningZodiac);
  const order = [...zodiacs.slice(0, rank - 1), winningZodiac, ...zodiacs.slice(rank - 1)];
  return order.map((zodiac, index) => {
    const zodiacNumbers = numbers.filter((number) => number.zodiac === zodiac);
    return {
      zodiac,
      score: 100 - index,
      numbers: zodiacNumbers,
      supportCount: 1,
      opposeCount: 0,
      supportRules: [evidence(`支持${zodiac}`)],
      opposeRules: [],
    };
  });
}

function reportWithRank(special: number, numberRank: number, zodiacRank = 3): CandidatePoolReport {
  const allNumbers = buildAllNumbers(special, numberRank);
  const winningZodiac = getNumberAttributes(special, defaultConfig).zodiac;
  const allZodiacs = buildAllZodiacs(allNumbers, winningZodiac, zodiacRank);
  const signals: RuleSignal[] = Array.from({ length: 6 }, (_, index) => ({
    ...evidence(`信号${index + 1}`),
    ruleId: `signal-${index + 1}`,
    ruleName: `信号${index + 1}`,
  }));
  return {
    generatedAt: "2026-06-27T12:00:00.000Z",
    latestIssue: "2026177",
    latestDate: "2026-06-26",
    latestNumbers: [1, 2, 3, 4, 5, 6, 7],
    ruleCount: 6,
    signalCount: signals.length,
    signals,
    allNumbers,
    allZodiacs,
    topNumbers8: allNumbers.slice(0, 8),
    topNumbers12: allNumbers.slice(0, 12),
    topNumbers16: allNumbers.slice(0, 16),
    topNumbers18: allNumbers.slice(0, 18),
    topZodiacs7: allZodiacs.slice(0, 7),
    topZodiacs8: allZodiacs.slice(0, 8),
    topZodiacs9: allZodiacs.slice(0, 9),
    riskNotice: "仅供参考",
  };
}

function historyItem(special = 18, rank = 5): ReferenceHistoryItem {
  return buildReferenceHistoryItem({
    report: reportWithRank(special, rank),
    saveType: "auto",
    dataSourceLabel: "测试数据",
    recordCount: 177,
  });
}

const draws: DrawRecord[] = [
  { issue: "2026177", date: "2026-06-26", year: 2026, n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: 7 },
  { issue: "2026178", date: "2026-06-27", year: 2026, n1: 8, n2: 9, n3: 10, n4: 11, n5: 12, n6: 13, special: 18 },
];

describe("reference history", () => {
  test("saves top bands, all 49 numbers, all zodiacs and evidence snapshot", () => {
    const record = historyItem(18, 5);

    expect(record.schemaVersion).toBe(2);
    expect(record.topNumbers8).toHaveLength(8);
    expect(record.topNumbers12).toHaveLength(12);
    expect(record.topNumbers16).toHaveLength(16);
    expect(record.topNumbers18).toHaveLength(18);
    expect(record.allNumbers).toHaveLength(49);
    expect(record.allZodiacs).toHaveLength(12);
    expect(record.evidenceSummary).toHaveLength(6);
  });

  test("resolves next draw hit in Top8", () => {
    const [resolved] = resolveReferenceHistoryOutcomes([historyItem(18, 5)], draws, defaultConfig);

    expect(resolved.hitTop8).toBe(true);
    expect(resolved.outcome?.hitBand).toBe("top8");
    expect(resolved.outcome?.hitNumberRank).toBe(5);
  });

  test("resolves next draw hit in Top13-18", () => {
    const [resolved] = resolveReferenceHistoryOutcomes([historyItem(18, 15)], draws, defaultConfig);

    expect(resolved.hitTop8).toBe(false);
    expect(resolved.hitTop18).toBe(true);
    expect(resolved.outcome?.hitBand).toBe("top13_18");
  });

  test("resolves next draw outside Top18", () => {
    const [resolved] = resolveReferenceHistoryOutcomes([historyItem(18, 30)], draws, defaultConfig);

    expect(resolved.hitTop18).toBe(false);
    expect(resolved.outcome?.hitBand).toBe("outside");
  });

  test("resolves zodiac Top7 and Top9 hits", () => {
    const [resolved] = resolveReferenceHistoryOutcomes([buildReferenceHistoryItem({
      report: reportWithRank(18, 20, 6),
      saveType: "auto",
      dataSourceLabel: "测试数据",
      recordCount: 177,
    })], draws, defaultConfig);

    expect(resolved.hitZodiac7).toBe(true);
    expect(resolved.hitZodiac9).toBe(true);
  });

  test("uses stable signature for the same recommendation and trims to 500 records", () => {
    const report = reportWithRank(18, 5);
    expect(referenceHistorySignature(report)).toBe(referenceHistorySignature(report));

    const records = Array.from({ length: 520 }, (_, index) => ({
      ...historyItem(18, 5),
      id: `record-${index}`,
      savedAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
    }));

    expect(trimReferenceHistory(records)).toHaveLength(500);
  });
});
