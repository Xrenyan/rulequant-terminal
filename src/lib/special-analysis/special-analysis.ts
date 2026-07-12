import { getNumberAttributes } from "@/lib/engine/attributes";
import type { DrawRecord, RuleQuantConfig } from "@/types/domain";

export type BinaryTrendKind = "size" | "parity";

export type BinaryTrendReport = {
  kind: BinaryTrendKind;
  title: string;
  labels: [string, string];
  sequence20: string[];
  sequence30: string[];
  currentLabel: string;
  currentStreak: number;
  probabilities: Array<{ label: string; probability: number }>;
  backtestTotal: number;
  backtestSuccess: number;
  backtestRate: number;
  trainingSamples: number;
  confidence: number;
  modelWeights: Array<{ label: string; weight: number }>;
  explanation: string;
};

export const DRAW_POSITION_LABELS = ["平1", "平2", "平3", "平4", "平5", "平6", "特码"] as const;

export type HistoricalNineGridMode = "zodiac" | "number";

export type HistoricalNineGridCell = {
  issue: string;
  rowOffset: -1 | 0 | 1;
  positionIndex: number;
  number: number;
  zodiac: string;
  isAnchor: boolean;
};

export type HistoricalNineGridOccurrence = {
  id: string;
  issue: string;
  positionIndex: number;
  columnIndexes: [number, number, number];
  cells: HistoricalNineGridCell[];
};

export type HistoricalNineGridRankingItem = {
  rank: number;
  key: string;
  label: string;
  number?: number;
  zodiac: string;
  count: number;
  anchorCount: number;
  share: number;
};

export type HistoricalNineGridBacktestRow = {
  anchorIssue: string;
  anchorNumber: number;
  anchorZodiac: string;
  nextIssue: string;
  actualNumber: number;
  actualZodiac: string;
  rank: number;
  sampleCount: number;
};

export type HistoricalNineGridBacktest = {
  total: number;
  averageRank: number;
  topRates: Array<{ top: number; success: number; rate: number }>;
  rows: HistoricalNineGridBacktestRow[];
};

export type HistoricalNineGridReport = {
  mode: HistoricalNineGridMode;
  anchorIssue: string;
  anchorNumber: number;
  anchorZodiac: string;
  targetIssue: string;
  occurrences: HistoricalNineGridOccurrence[];
  rankings: HistoricalNineGridRankingItem[];
  conditionedBacktest: HistoricalNineGridBacktest;
  overallBacktest: HistoricalNineGridBacktest;
};

function rate(success: number, total: number) {
  return total ? Number(((success / total) * 100).toFixed(2)) : 0;
}

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function sortDraws(draws: DrawRecord[]) {
  return [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}

function drawNumbers(draw: DrawRecord) {
  return [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
}

function nextIssueLabel(issue: string) {
  const match = issue.match(/^(.*?)(\d+)$/);
  if (!match) return "下一期";
  const [, prefix, numeric] = match;
  return `${prefix}${String(Number(numeric) + 1).padStart(numeric.length, "0")}`;
}

function buildHistoricalOccurrences(
  sorted: DrawRecord[],
  config: RuleQuantConfig,
  currentIndex: number,
  mode: HistoricalNineGridMode,
  anchorNumber: number,
  anchorZodiac: string,
): HistoricalNineGridOccurrence[] {
  const occurrences: HistoricalNineGridOccurrence[] = [];

  // The latest issue supplies the anchor. Historical centers only use rows
  // whose previous and following issues were already available at that time.
  for (let drawIndex = 1; drawIndex < currentIndex; drawIndex += 1) {
    const centerDraw = sorted[drawIndex];
    drawNumbers(centerDraw).forEach((number, positionIndex) => {
      const zodiac = getNumberAttributes(number, config).zodiac;
      const matches = mode === "number" ? number === anchorNumber : zodiac === anchorZodiac;
      if (!matches) return;

      const windowStart = Math.min(Math.max(positionIndex - 1, 0), 4);
      const columnIndexes: [number, number, number] = [windowStart, windowStart + 1, windowStart + 2];
      const cells: HistoricalNineGridCell[] = [];
      ([-1, 0, 1] as const).forEach((rowOffset) => {
        const rowDraw = sorted[drawIndex + rowOffset];
        columnIndexes.forEach((columnIndex) => {
          const cellNumber = drawNumbers(rowDraw)[columnIndex];
          cells.push({
            issue: rowDraw.issue,
            rowOffset,
            positionIndex: columnIndex,
            number: cellNumber,
            zodiac: getNumberAttributes(cellNumber, config).zodiac,
            isAnchor: rowOffset === 0 && columnIndex === positionIndex,
          });
        });
      });

      occurrences.push({
        id: `${centerDraw.issue}-${positionIndex}-${mode}`,
        issue: centerDraw.issue,
        positionIndex,
        columnIndexes,
        cells,
      });
    });
  }

  return occurrences.reverse();
}

function buildHistoricalRanking(occurrences: HistoricalNineGridOccurrence[], mode: HistoricalNineGridMode, config: RuleQuantConfig): HistoricalNineGridRankingItem[] {
  const totalCells = occurrences.length * 9;
  const counts = new Map<string, { count: number; anchorCount: number }>();
  occurrences.forEach((occurrence) => occurrence.cells.forEach((cell) => {
    const key = mode === "number" ? String(cell.number) : cell.zodiac;
    const current = counts.get(key) ?? { count: 0, anchorCount: 0 };
    current.count += 1;
    if (cell.isAnchor) current.anchorCount += 1;
    counts.set(key, current);
  }));

  const source: Array<{ key: string; number?: number; zodiac: string }> = mode === "number"
    ? range(1, 49).map((number) => ({ key: String(number), number, zodiac: getNumberAttributes(number, config).zodiac }))
    : config.zodiacOrder.map((zodiac) => ({ key: zodiac, zodiac }));

  return source
    .map((item, sourceIndex) => {
      const count = counts.get(item.key) ?? { count: 0, anchorCount: 0 };
      return {
        rank: 0,
        key: item.key,
        label: mode === "number" ? String(item.number ?? 0).padStart(2, "0") : item.zodiac,
        number: item.number,
        zodiac: item.zodiac,
        count: count.count,
        anchorCount: count.anchorCount,
        share: totalCells ? Number(((count.count / totalCells) * 100).toFixed(2)) : 0,
        sourceIndex,
      };
    })
    .sort((a, b) => b.count - a.count || a.sourceIndex - b.sourceIndex)
    .map(({ sourceIndex: _sourceIndex, ...item }, index) => ({ ...item, rank: index + 1 }));
}

function summarizeBacktest(rows: HistoricalNineGridBacktestRow[], mode: HistoricalNineGridMode): HistoricalNineGridBacktest {
  const tops = mode === "number" ? [8, 12, 18] : [7, 8, 9];
  return {
    total: rows.length,
    averageRank: rows.length ? Number((rows.reduce((sum, row) => sum + row.rank, 0) / rows.length).toFixed(2)) : 0,
    topRates: tops.map((top) => {
      const success = rows.filter((row) => row.rank <= top).length;
      return { top, success, rate: rate(success, rows.length) };
    }),
    rows: [...rows].reverse(),
  };
}

function backtestHistoricalNineGrid(
  sorted: DrawRecord[],
  config: RuleQuantConfig,
  mode: HistoricalNineGridMode,
  currentAnchorNumber: number,
  currentAnchorZodiac: string,
  conditioned: boolean,
): HistoricalNineGridBacktest {
  const rows: HistoricalNineGridBacktestRow[] = [];
  for (let currentIndex = 3; currentIndex < sorted.length - 1; currentIndex += 1) {
    const anchorDraw = sorted[currentIndex];
    const anchorNumber = anchorDraw.special;
    const anchorZodiac = getNumberAttributes(anchorNumber, config).zodiac;
    if (conditioned) {
      const matchesCurrent = mode === "number" ? anchorNumber === currentAnchorNumber : anchorZodiac === currentAnchorZodiac;
      if (!matchesCurrent) continue;
    }

    const occurrences = buildHistoricalOccurrences(sorted, config, currentIndex, mode, anchorNumber, anchorZodiac);
    if (!occurrences.length) continue;
    const rankings = buildHistoricalRanking(occurrences, mode, config);
    const nextDraw = sorted[currentIndex + 1];
    const actualNumber = nextDraw.special;
    const actualZodiac = getNumberAttributes(actualNumber, config).zodiac;
    const actualKey = mode === "number" ? String(actualNumber) : actualZodiac;
    rows.push({
      anchorIssue: anchorDraw.issue,
      anchorNumber,
      anchorZodiac,
      nextIssue: nextDraw.issue,
      actualNumber,
      actualZodiac,
      rank: rankings.find((item) => item.key === actualKey)?.rank ?? rankings.length,
      sampleCount: occurrences.length,
    });
  }
  return summarizeBacktest(rows, mode);
}

export function analyzeHistoricalNineGrid(draws: DrawRecord[], config: RuleQuantConfig, mode: HistoricalNineGridMode): HistoricalNineGridReport | undefined {
  const sorted = sortDraws(draws);
  const currentIndex = sorted.length - 1;
  const anchorDraw = sorted[currentIndex];
  if (!anchorDraw || currentIndex < 1) return undefined;
  const anchorNumber = anchorDraw.special;
  const anchorZodiac = getNumberAttributes(anchorNumber, config).zodiac;
  const occurrences = buildHistoricalOccurrences(sorted, config, currentIndex, mode, anchorNumber, anchorZodiac);
  return {
    mode,
    anchorIssue: anchorDraw.issue,
    anchorNumber,
    anchorZodiac,
    targetIssue: nextIssueLabel(anchorDraw.issue),
    occurrences,
    rankings: buildHistoricalRanking(occurrences, mode, config),
    conditionedBacktest: backtestHistoricalNineGrid(sorted, config, mode, anchorNumber, anchorZodiac, true),
    overallBacktest: backtestHistoricalNineGrid(sorted, config, mode, anchorNumber, anchorZodiac, false),
  };
}

function stateFor(number: number, kind: BinaryTrendKind) {
  if (kind === "size") return number >= 25 ? 0 : 1;
  return number % 2 === 1 ? 0 : 1;
}

function labelsFor(kind: BinaryTrendKind): [string, string] {
  return kind === "size" ? ["大", "小"] : ["单", "双"];
}

type TrendModel = { label: string; predict: (states: number[]) => number };

function boundedProbability(value: number) {
  return Math.min(0.95, Math.max(0.05, value));
}

function frequencyProbability(states: number[], window: number) {
  const sample = states.slice(-window);
  return sample.length ? (sample.filter((state) => state === 0).length + 1) / (sample.length + 2) : 0.5;
}

function recencyProbability(states: number[]) {
  const sample = states.slice(-40);
  if (!sample.length) return 0.5;
  let zeroWeight = 1;
  let totalWeight = 2;
  sample.forEach((state, index) => {
    const weight = 0.88 ** (sample.length - index - 1);
    totalWeight += weight;
    if (state === 0) zeroWeight += weight;
  });
  return zeroWeight / totalWeight;
}

function patternProbability(states: number[], order: number) {
  if (states.length <= order) return frequencyProbability(states, 30);
  const pattern = states.slice(-order);
  let zero = 1;
  let one = 1;
  for (let index = order; index < states.length; index += 1) {
    if (!pattern.every((value, offset) => states[index - order + offset] === value)) continue;
    if (states[index] === 0) zero += 1;
    else one += 1;
  }
  return zero / (zero + one);
}

function currentRunLength(states: number[]) {
  const current = states.at(-1);
  if (current === undefined) return 0;
  let length = 0;
  for (let index = states.length - 1; index >= 0 && states[index] === current; index -= 1) length += 1;
  return length;
}

function streakProbability(states: number[]) {
  const current = states.at(-1);
  if (current === undefined) return 0.5;
  const targetRun = Math.min(currentRunLength(states), 4);
  let zero = 1;
  let one = 1;
  for (let nextIndex = 1; nextIndex < states.length; nextIndex += 1) {
    if (states[nextIndex - 1] !== current) continue;
    let run = 0;
    for (let index = nextIndex - 1; index >= 0 && states[index] === current; index -= 1) run += 1;
    if (Math.min(run, 4) !== targetRun) continue;
    if (states[nextIndex] === 0) zero += 1;
    else one += 1;
  }
  return zero / (zero + one);
}

const TREND_MODELS: TrendModel[] = [
  { label: "近10期", predict: (states) => frequencyProbability(states, 10) },
  { label: "近20期", predict: (states) => frequencyProbability(states, 20) },
  { label: "近30期", predict: (states) => frequencyProbability(states, 30) },
  { label: "时间衰减", predict: recencyProbability },
  { label: "一阶走势", predict: (states) => patternProbability(states, 1) },
  { label: "二阶走势", predict: (states) => patternProbability(states, 2) },
  { label: "三阶走势", predict: (states) => patternProbability(states, 3) },
  { label: "连开状态", predict: streakProbability },
];

function learnedTrendProbability(states: number[]) {
  if (!states.length) return { probabilities: [0.5, 0.5] as const, weights: TREND_MODELS.map((model) => ({ label: model.label, weight: 1 / TREND_MODELS.length })), trainingSamples: 0 };
  const losses = TREND_MODELS.map(() => 0);
  const startIndex = Math.max(8, states.length - 80);
  let trainingSamples = 0;
  for (let targetIndex = startIndex; targetIndex < states.length; targetIndex += 1) {
    const history = states.slice(0, targetIndex);
    TREND_MODELS.forEach((model, modelIndex) => {
      const predictedZero = boundedProbability(model.predict(history));
      const actualZero = states[targetIndex] === 0 ? 1 : 0;
      losses[modelIndex] += (predictedZero - actualZero) ** 2;
    });
    trainingSamples += 1;
  }
  const rawWeights = losses.map((loss) => Math.exp(-6 * (trainingSamples ? loss / trainingSamples : 0.25)));
  const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const weights = TREND_MODELS.map((model, index) => ({ label: model.label, weight: rawWeights[index] / weightTotal }));
  const probabilityZero = boundedProbability(TREND_MODELS.reduce((sum, model, index) => sum + boundedProbability(model.predict(states)) * weights[index].weight, 0));
  return { probabilities: [probabilityZero, 1 - probabilityZero] as const, weights, trainingSamples };
}

export function analyzeBinaryTrend(draws: DrawRecord[], kind: BinaryTrendKind): BinaryTrendReport {
  const labels = labelsFor(kind);
  const states = sortDraws(draws).map((draw) => stateFor(draw.special, kind));
  const learned = learnedTrendProbability(states);
  let backtestTotal = 0;
  let backtestSuccess = 0;
  for (let index = Math.max(20, states.length - 100); index < states.length; index += 1) {
    const model = learnedTrendProbability(states.slice(0, index)).probabilities;
    const prediction = model[0] >= model[1] ? 0 : 1;
    backtestTotal += 1;
    if (prediction === states[index]) backtestSuccess += 1;
  }
  const current = states.at(-1);
  const probabilities = learned.probabilities;
  return {
    kind,
    title: kind === "size" ? "特码大小走势" : "特码单双走势",
    labels,
    sequence20: states.slice(-20).map((state) => labels[state]),
    sequence30: states.slice(-30).map((state) => labels[state]),
    currentLabel: current === undefined ? "-" : labels[current],
    currentStreak: currentRunLength(states),
    probabilities: [
      { label: labels[0], probability: Number((probabilities[0] * 100).toFixed(2)) },
      { label: labels[1], probability: Number((probabilities[1] * 100).toFixed(2)) },
    ],
    backtestTotal,
    backtestSuccess,
    backtestRate: rate(backtestSuccess, backtestTotal),
    trainingSamples: learned.trainingSamples,
    confidence: Number((Math.abs(probabilities[0] - probabilities[1]) * 100).toFixed(2)),
    modelWeights: learned.weights.map((item) => ({ label: item.label, weight: Number((item.weight * 100).toFixed(1)) })).sort((a, b) => b.weight - a.weight),
    explanation: "自适应模型会从历史数据学习近期频率、时间衰减、1至3阶走势和连开状态，并按滚动预测误差自动调整各模型权重；不是固定格式，仅用于走势研究。",
  };
}
