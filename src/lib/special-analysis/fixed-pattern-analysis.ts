import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

export type FixedPatternColor = "红" | "蓝" | "绿";

export type FixedPatternSourceId =
  | "color_previous_zodiac"
  | "color_date_table_1"
  | "color_date_table_2"
  | "tail_previous_special"
  | "tail_previous_zodiac"
  | "tail_date_table";

export type FixedPatternHitStats = {
  samples: number;
  hits: number;
  rate: number;
};

export type FixedPatternWindowStats = {
  all: FixedPatternHitStats;
  last10: FixedPatternHitStats;
  last20: FixedPatternHitStats;
  last30: FixedPatternHitStats;
};

export type FixedPatternSourceSupport<T extends FixedPatternColor | number> = {
  sourceId: FixedPatternSourceId;
  sourceName: string;
  value: T;
  strength: number;
  learnedWeight: number;
  contribution: number;
  historicalStats: FixedPatternWindowStats;
};

export type FixedPatternCandidate<T extends FixedPatternColor | number> = {
  rank: number;
  value: T;
  score: number;
  probability: number;
  supportSources: FixedPatternSourceSupport<T>[];
  historicalStats: FixedPatternWindowStats;
};

export type FixedPatternSourcePrediction = {
  sourceId: FixedPatternSourceId;
  sourceName: string;
  target: "color" | "tail";
  values: Array<FixedPatternColor | number>;
  evaluationValues: Array<FixedPatternColor | number>;
  learnedWeight: number;
  hit: boolean;
};

export type FixedPatternBacktestRecord = {
  issue: string;
  date?: string;
  previousIssue: string;
  previousSpecial: number;
  previousZodiac: string;
  actualSpecial: number;
  actualColor: FixedPatternColor;
  actualTail: number;
  top2Colors: FixedPatternColor[];
  top5Tails: number[];
  top7Tails: number[];
  colorHit: boolean;
  tailTop5Hit: boolean;
  tailTop7Hit: boolean;
  sourcePredictions: FixedPatternSourcePrediction[];
};

export type FixedPatternSourceSummary = {
  sourceId: FixedPatternSourceId;
  sourceName: string;
  target: "color" | "tail";
  historicalStats: FixedPatternWindowStats;
};

export type FixedPatternCombinedBacktest = {
  colorTop2: FixedPatternWindowStats;
  tailTop5: FixedPatternWindowStats;
  tailTop7: FixedPatternWindowStats;
  totalPeriods: number;
};

export type FixedPatternNextPrediction = {
  targetIssue: string;
  targetDate?: string;
  basedOnIssue: string;
  basedOnSpecial: number;
  basedOnZodiac: string;
  top2Colors: FixedPatternCandidate<FixedPatternColor>[];
  top5Tails: FixedPatternCandidate<number>[];
  top7Tails: FixedPatternCandidate<number>[];
  sourcePredictions: Omit<FixedPatternSourcePrediction, "hit">[];
};

export type FixedPatternAnalysisReport = {
  generatedAt: string;
  disclaimer: string;
  nextPrediction?: FixedPatternNextPrediction;
  sourceSummaries: FixedPatternSourceSummary[];
  combinedBacktest: FixedPatternCombinedBacktest;
  recentRecords: FixedPatternBacktestRecord[];
  allRecords: FixedPatternBacktestRecord[];
};

export type FixedPatternAnalysisOptions = {
  nextDate?: string;
  recentLimit?: number;
};

type SourceDefinition = {
  id: FixedPatternSourceId;
  name: string;
  target: "color" | "tail";
  universeSize: number;
};

type WeightedValue<T extends FixedPatternColor | number> = {
  value: T;
  strength: number;
  evaluation: boolean;
};

type RuleSignal<T extends FixedPatternColor | number = FixedPatternColor | number> = {
  source: SourceDefinition;
  values: WeightedValue<T>[];
};

type SourceOutcome = {
  issue: string;
  hit: boolean;
};

type ScoredValue<T extends FixedPatternColor | number> = {
  value: T;
  score: number;
  probability: number;
  supportSources: FixedPatternSourceSupport<T>[];
};

const COLORS: FixedPatternColor[] = ["红", "蓝", "绿"];
const TAILS = Array.from({ length: 10 }, (_, index) => index);
const PRIOR_STRENGTH = 8;
const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 4;

const SOURCES: SourceDefinition[] = [
  { id: "color_previous_zodiac", name: "上期特肖旺波", target: "color", universeSize: 3 },
  { id: "color_date_table_1", name: "开奖日出波表一", target: "color", universeSize: 3 },
  { id: "color_date_table_2", name: "开奖日出波表二", target: "color", universeSize: 3 },
  { id: "tail_previous_special", name: "上期特尾六尾表", target: "tail", universeSize: 10 },
  { id: "tail_previous_zodiac", name: "上期特肖奇门出尾", target: "tail", universeSize: 10 },
  { id: "tail_date_table", name: "开奖日八尾表", target: "tail", universeSize: 10 },
];

const SOURCE_BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

const COLOR_BY_ZODIAC: Record<string, { primary: FixedPatternColor[]; secondary?: FixedPatternColor[] }> = {
  鼠: { primary: ["红", "绿"] },
  牛: { primary: ["绿", "红"] },
  虎: { primary: ["绿"] },
  兔: { primary: ["红"] },
  龙: { primary: ["红", "绿"] },
  蛇: { primary: ["红", "蓝"] },
  马: { primary: ["红", "绿"] },
  羊: { primary: ["蓝"], secondary: ["红", "绿"] },
  猴: { primary: ["红", "绿"] },
  鸡: { primary: ["蓝", "红"] },
  狗: { primary: ["蓝", "红"] },
  猪: { primary: ["红", "绿"] },
};

const COLOR_DATE_TABLE_1: Record<number, FixedPatternColor[]> = buildDayTable([
  [[2, 12, 22], ["红", "绿"]],
  [[3, 13, 23], ["红", "蓝"]],
  [[5, 15, 25], ["绿", "蓝"]],
  [[6, 16, 26], ["绿", "蓝"]],
  [[7, 17, 27], ["绿", "红"]],
  [[8, 18, 28], ["绿", "红"]],
  [[9, 19, 29], ["蓝", "红"]],
  [[10, 20, 30], ["蓝", "红"]],
  [[1, 11, 21, 31], ["蓝", "绿"]],
]);

const COLOR_DATE_TABLE_2: Record<number, FixedPatternColor[]> = buildDayTable([
  [[3, 4, 6, 11, 12, 19, 20, 30], ["绿", "红"]],
  [[1, 2, 15, 16, 23, 24, 31], ["红", "绿"]],
  [[7, 8, 21, 22, 29], ["蓝", "绿"]],
  [[9, 10, 17, 18, 25, 26], ["蓝", "红"]],
  [[5, 13, 14, 27, 28], ["红", "蓝"]],
]);

const TAIL_BY_SPECIAL_TAIL: Record<number, number[]> = {
  1: digits("012895"),
  2: digits("123789"),
  3: digits("234678"),
  4: digits("345067"),
  5: digits("456091"),
  6: digits("567340"),
  7: digits("234678"),
  8: digits("123789"),
  9: digits("890512"),
  0: digits("456901"),
};

const TAIL_BY_ZODIAC: Record<string, number[]> = {
  鼠: digits("1234589"),
  牛: digits("0134789"),
  虎: digits("0456789"),
  兔: digits("2356789"),
  龙: digits("1245689"),
  蛇: digits("1456789"),
  马: digits("0124567"),
  羊: digits("0134679"),
  猴: digits("0123468"),
  鸡: digits("0235789"),
  狗: digits("0235689"),
  猪: digits("0123679"),
};

const TAIL_DATE_TABLE: Record<number, number[]> = buildDayTable([
  [[1, 11, 21, 31], digits("13570248")],
  [[2, 12, 22], digits("13592468")],
  [[3, 13, 23], digits("35790246")],
  [[4, 14, 24], digits("13570468")],
  [[5, 15, 25], digits("15792468")],
  [[6, 16, 26], digits("35790268")],
  [[7, 17, 27], digits("13790468")],
  [[8, 18, 28], digits("15790248")],
  [[9, 19, 29], digits("13590268")],
  [[10, 20, 30], digits("13790246")],
]);

export const FIXED_PATTERN_RULES = {
  colorByPreviousZodiac: COLOR_BY_ZODIAC,
  colorByDayTable1: COLOR_DATE_TABLE_1,
  colorByDayTable2: COLOR_DATE_TABLE_2,
  tailsByPreviousSpecialTail: TAIL_BY_SPECIAL_TAIL,
  tailsByPreviousZodiac: TAIL_BY_ZODIAC,
  tailsByDay: TAIL_DATE_TABLE,
} as const;

function digits(value: string): number[] {
  return [...value].map(Number);
}

function buildDayTable<T extends FixedPatternColor | number>(
  groups: Array<[number[], T[]]>,
): Record<number, T[]> {
  return groups.reduce<Record<number, T[]>>((table, [days, values]) => {
    days.forEach((day) => {
      table[day] = [...values];
    });
    return table;
  }, {});
}

function sortDraws(draws: DrawRecord[]): DrawRecord[] {
  const byIssue = new Map<string, DrawRecord>();
  draws.forEach((draw) => byIssue.set(draw.issue, draw));
  return [...byIssue.values()].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}

function source(id: FixedPatternSourceId): SourceDefinition {
  const match = SOURCE_BY_ID.get(id);
  if (!match) throw new Error(`未知固定规律来源：${id}`);
  return match;
}

function lookupConfiguredValue(table: Record<string, number[]>, number: number): string {
  return Object.entries(table).find(([, values]) => values.includes(number))?.[0] ?? "";
}

function specialZodiac(draw: DrawRecord, config: RuleQuantConfig): string {
  const rawBalls = draw.rawAttributes?.balls;
  if (Array.isArray(rawBalls)) {
    const rawSpecial = rawBalls.find((ball) => {
      if (!ball || typeof ball !== "object") return false;
      return Number((ball as { number?: unknown }).number) === draw.special;
    }) as { zodiac?: unknown } | undefined;
    if (typeof rawSpecial?.zodiac === "string" && rawSpecial.zodiac) return rawSpecial.zodiac;
  }
  return lookupConfiguredValue(config.zodiacTable, draw.special);
}

function specialColor(draw: DrawRecord, config: RuleQuantConfig): FixedPatternColor {
  const rawBalls = draw.rawAttributes?.balls;
  if (Array.isArray(rawBalls)) {
    const rawSpecial = rawBalls.find((ball) => {
      if (!ball || typeof ball !== "object") return false;
      return Number((ball as { number?: unknown }).number) === draw.special;
    }) as { color?: unknown } | undefined;
    if (rawSpecial?.color === "红" || rawSpecial?.color === "蓝" || rawSpecial?.color === "绿") return rawSpecial.color;
  }
  const color = lookupConfiguredValue(config.colorTable, draw.special);
  if (color === "红" || color === "蓝" || color === "绿") return color;
  throw new Error(`号码 ${draw.special} 未匹配红蓝绿波色`);
}

function dayOfMonth(date?: string): number | undefined {
  if (!date) return undefined;
  const normalized = date.trim();
  const match = normalized.match(/^\d{4}[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const day = Number(match[2]);
    return day >= 1 && day <= 31 ? day : undefined;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.getUTCDate();
}

function signal<T extends FixedPatternColor | number>(
  id: FixedPatternSourceId,
  values: T[],
  secondaryValues: T[] = [],
): RuleSignal<T> {
  return {
    source: source(id),
    values: [
      ...values.map((value) => ({ value, strength: 1, evaluation: true })),
      ...secondaryValues.map((value) => ({ value, strength: 0.25, evaluation: false })),
    ],
  };
}

export function buildFixedPatternSignals(
  previousDraw: DrawRecord,
  targetDate: string | undefined,
  config: RuleQuantConfig,
): RuleSignal[] {
  const zodiac = specialZodiac(previousDraw, config);
  const day = dayOfMonth(targetDate);
  const zodiacColors = COLOR_BY_ZODIAC[zodiac];
  const signals: RuleSignal[] = [];

  if (zodiacColors) {
    signals.push(signal("color_previous_zodiac", zodiacColors.primary, zodiacColors.secondary));
  }
  if (day && COLOR_DATE_TABLE_1[day]) {
    signals.push(signal("color_date_table_1", COLOR_DATE_TABLE_1[day]));
  }
  if (day && COLOR_DATE_TABLE_2[day]) {
    signals.push(signal("color_date_table_2", COLOR_DATE_TABLE_2[day]));
  }

  signals.push(signal("tail_previous_special", TAIL_BY_SPECIAL_TAIL[previousDraw.special % 10]));
  if (TAIL_BY_ZODIAC[zodiac]) {
    signals.push(signal("tail_previous_zodiac", TAIL_BY_ZODIAC[zodiac]));
  }
  if (day && TAIL_DATE_TABLE[day]) {
    signals.push(signal("tail_date_table", TAIL_DATE_TABLE[day]));
  }

  return signals;
}

function stats(outcomes: boolean[]): FixedPatternHitStats {
  const hits = outcomes.filter(Boolean).length;
  return {
    samples: outcomes.length,
    hits,
    rate: outcomes.length ? round((hits / outcomes.length) * 100) : 0,
  };
}

function windowStats(outcomes: boolean[]): FixedPatternWindowStats {
  return {
    all: stats(outcomes),
    last10: stats(outcomes.slice(-10)),
    last20: stats(outcomes.slice(-20)),
    last30: stats(outcomes.slice(-30)),
  };
}

function sourceWindowStats(history: Map<FixedPatternSourceId, SourceOutcome[]>, id: FixedPatternSourceId) {
  return windowStats((history.get(id) ?? []).map((outcome) => outcome.hit));
}

function learnedWeight(signalValue: RuleSignal, history: Map<FixedPatternSourceId, SourceOutcome[]>): number {
  const outcomes = history.get(signalValue.source.id) ?? [];
  const evaluationCount = signalValue.values.filter((value) => value.evaluation).length;
  const baseline = Math.max(evaluationCount / signalValue.source.universeSize, 1 / signalValue.source.universeSize);
  const hits = outcomes.filter((outcome) => outcome.hit).length;
  const posteriorRate = (hits + PRIOR_STRENGTH * baseline) / (outcomes.length + PRIOR_STRENGTH);
  return round(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, posteriorRate / baseline)), 6);
}

function scoreSignals<T extends FixedPatternColor | number>(
  universe: T[],
  signals: RuleSignal[],
  history: Map<FixedPatternSourceId, SourceOutcome[]>,
): ScoredValue<T>[] {
  const scores = new Map<T, { score: number; support: FixedPatternSourceSupport<T>[] }>(
    universe.map((value) => [value, { score: 0, support: [] }]),
  );

  signals.forEach((signalValue) => {
    const weight = learnedWeight(signalValue, history);
    const strengthTotal = signalValue.values.reduce((total, value) => total + value.strength, 0);
    signalValue.values.forEach((weightedValue) => {
      const entry = scores.get(weightedValue.value as T);
      if (!entry || strengthTotal <= 0) return;
      const contribution = weight * (weightedValue.strength / strengthTotal);
      entry.score += contribution;
      entry.support.push({
        sourceId: signalValue.source.id,
        sourceName: signalValue.source.name,
        value: weightedValue.value as T,
        strength: weightedValue.strength,
        learnedWeight: weight,
        contribution: round(contribution, 6),
        historicalStats: sourceWindowStats(history, signalValue.source.id),
      });
    });
  });

  const totalScore = [...scores.values()].reduce((total, entry) => total + entry.score, 0);
  return [...scores.entries()]
    .map(([value, entry]) => ({
      value,
      score: round(entry.score, 6),
      probability: totalScore > 0 ? round((entry.score / totalScore) * 100, 4) : 0,
      supportSources: entry.support.sort((a, b) => b.contribution - a.contribution || a.sourceName.localeCompare(b.sourceName, "zh-CN")),
    }))
    .sort((a, b) => b.score - a.score || String(a.value).localeCompare(String(b.value), "zh-CN", { numeric: true }));
}

function candidateStats<T extends FixedPatternColor | number>(
  records: FixedPatternBacktestRecord[],
  value: T,
  list: "color" | "tail5" | "tail7",
): FixedPatternWindowStats {
  const outcomes = records.flatMap((record) => {
    const included =
      list === "color"
        ? record.top2Colors.includes(value as FixedPatternColor)
        : list === "tail5"
          ? record.top5Tails.includes(value as number)
          : record.top7Tails.includes(value as number);
    if (!included) return [];
    const hit = list === "color" ? record.actualColor === value : record.actualTail === value;
    return [hit];
  });
  return windowStats(outcomes);
}

function candidates<T extends FixedPatternColor | number>(
  scored: ScoredValue<T>[],
  count: number,
  priorRecords: FixedPatternBacktestRecord[],
  list: "color" | "tail5" | "tail7",
): FixedPatternCandidate<T>[] {
  return scored.slice(0, count).map((candidate, index) => ({
    rank: index + 1,
    value: candidate.value,
    score: candidate.score,
    probability: candidate.probability,
    supportSources: candidate.supportSources,
    historicalStats: candidateStats(priorRecords, candidate.value, list),
  }));
}

function sourcePredictions(
  signals: RuleSignal[],
  history: Map<FixedPatternSourceId, SourceOutcome[]>,
  actual?: { color: FixedPatternColor; tail: number },
): Array<FixedPatternSourcePrediction | Omit<FixedPatternSourcePrediction, "hit">> {
  return signals.map((signalValue) => {
    const values = signalValue.values.map((value) => value.value);
    const evaluationValues = signalValue.values.filter((value) => value.evaluation).map((value) => value.value);
    const common = {
      sourceId: signalValue.source.id,
      sourceName: signalValue.source.name,
      target: signalValue.source.target,
      values,
      evaluationValues,
      learnedWeight: learnedWeight(signalValue, history),
    };
    if (!actual) return common;
    const actualValue = signalValue.source.target === "color" ? actual.color : actual.tail;
    return { ...common, hit: evaluationValues.includes(actualValue) };
  });
}

function addSourceOutcomes(
  predictions: FixedPatternSourcePrediction[],
  issue: string,
  history: Map<FixedPatternSourceId, SourceOutcome[]>,
) {
  predictions.forEach((prediction) => {
    const outcomes = history.get(prediction.sourceId) ?? [];
    outcomes.push({ issue, hit: prediction.hit });
    history.set(prediction.sourceId, outcomes);
  });
}

function inferNextIssue(issue: string): string {
  const match = issue.match(/^(.*?)(\d+)$/);
  if (!match) return "下一期";
  const [, prefix, digitsValue] = match;
  return `${prefix}${String(Number(digitsValue) + 1).padStart(digitsValue.length, "0")}`;
}

function parseDate(date?: string): Date | undefined {
  if (!date) return undefined;
  const match = date.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return undefined;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function inferNextDate(draws: DrawRecord[]): string | undefined {
  const dated = draws
    .map((draw) => parseDate(draw.date))
    .filter((date): date is Date => Boolean(date));
  if (!dated.length) return undefined;
  const recent = dated.slice(-21);
  const gaps = recent
    .slice(1)
    .map((date, index) => Math.round((date.getTime() - recent[index].getTime()) / 86_400_000))
    .filter((gap) => gap > 0 && gap <= 7)
    .sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1;
  const next = new Date(dated[dated.length - 1].getTime() + gap * 86_400_000);
  return formatDate(next);
}

function round(value: number, precision = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function combinedWindowStats(records: FixedPatternBacktestRecord[], key: "colorHit" | "tailTop5Hit" | "tailTop7Hit") {
  return windowStats(records.map((record) => record[key]));
}

export function analyzeFixedPatternHistory(
  draws: DrawRecord[],
  config: RuleQuantConfig,
  options: FixedPatternAnalysisOptions = {},
): FixedPatternAnalysisReport {
  const sorted = sortDraws(draws);
  const sourceHistory = new Map<FixedPatternSourceId, SourceOutcome[]>();
  const records: FixedPatternBacktestRecord[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const target = sorted[index];
    const signals = buildFixedPatternSignals(previous, target.date, config);
    const colorSignals = signals.filter((entry) => entry.source.target === "color");
    const tailSignals = signals.filter((entry) => entry.source.target === "tail");
    const colorScores = scoreSignals(COLORS, colorSignals, sourceHistory);
    const tailScores = scoreSignals(TAILS, tailSignals, sourceHistory);
    const top2Colors = colorScores.slice(0, 2).map((candidate) => candidate.value);
    const top5Tails = tailScores.slice(0, 5).map((candidate) => candidate.value);
    const top7Tails = tailScores.slice(0, 7).map((candidate) => candidate.value);
    const actualColor = specialColor(target, config);
    const actualTail = target.special % 10;
    const predictions = sourcePredictions(signals, sourceHistory, { color: actualColor, tail: actualTail }) as FixedPatternSourcePrediction[];

    records.push({
      issue: target.issue,
      date: target.date,
      previousIssue: previous.issue,
      previousSpecial: previous.special,
      previousZodiac: specialZodiac(previous, config),
      actualSpecial: target.special,
      actualColor,
      actualTail,
      top2Colors,
      top5Tails,
      top7Tails,
      colorHit: top2Colors.includes(actualColor),
      tailTop5Hit: top5Tails.includes(actualTail),
      tailTop7Hit: top7Tails.includes(actualTail),
      sourcePredictions: predictions,
    });
    addSourceOutcomes(predictions, target.issue, sourceHistory);
  }

  const latest = sorted.at(-1);
  let nextPrediction: FixedPatternNextPrediction | undefined;
  if (latest) {
    const targetDate = options.nextDate ?? inferNextDate(sorted);
    const signals = buildFixedPatternSignals(latest, targetDate, config);
    const colorScores = scoreSignals(COLORS, signals.filter((entry) => entry.source.target === "color"), sourceHistory);
    const tailScores = scoreSignals(TAILS, signals.filter((entry) => entry.source.target === "tail"), sourceHistory);
    nextPrediction = {
      targetIssue: inferNextIssue(latest.issue),
      targetDate,
      basedOnIssue: latest.issue,
      basedOnSpecial: latest.special,
      basedOnZodiac: specialZodiac(latest, config),
      top2Colors: candidates(colorScores, 2, records, "color"),
      top5Tails: candidates(tailScores, 5, records, "tail5"),
      top7Tails: candidates(tailScores, 7, records, "tail7"),
      sourcePredictions: sourcePredictions(signals, sourceHistory) as Omit<FixedPatternSourcePrediction, "hit">[],
    };
  }

  const sourceSummaries = SOURCES.map((definition) => ({
    sourceId: definition.id,
    sourceName: definition.name,
    target: definition.target,
    historicalStats: sourceWindowStats(sourceHistory, definition.id),
  }));
  const recentLimit = Math.max(1, Math.floor(options.recentLimit ?? 30));

  return {
    generatedAt: new Date().toISOString(),
    disclaimer: "固定规律与组合结果仅用于历史数据观察，不代表未来一定有效。",
    nextPrediction,
    sourceSummaries,
    combinedBacktest: {
      colorTop2: combinedWindowStats(records, "colorHit"),
      tailTop5: combinedWindowStats(records, "tailTop5Hit"),
      tailTop7: combinedWindowStats(records, "tailTop7Hit"),
      totalPeriods: records.length,
    },
    recentRecords: records.slice(-recentLimit).reverse(),
    allRecords: records,
  };
}
