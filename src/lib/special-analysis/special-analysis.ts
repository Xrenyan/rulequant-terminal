import { getNumberAttributes, normalizeDraw } from "@/lib/engine/attributes";
import { evaluateFormulaExpression } from "@/lib/formula-engine/formula-engine";
import type { DrawRecord, OrderMode, RuleQuantConfig } from "@/types/domain";

export type SpecialRuleId = "half-head-l" | "half-head-d" | "kill-color" | "kill-door" | "seven-tail-d" | "kill-element-d";

export type SpecialRuleSpec = {
  id: SpecialRuleId;
  name: string;
  category: string;
  formula: string;
  orderMode: OrderMode;
  explanation: string;
};

export type SpecialRuleDetail = {
  currentIssue: string;
  currentNumbers: number[];
  variables: Record<string, number>;
  expression: string;
  rawResult: number;
  normalizedValue: number;
  normalizerSteps: number[];
  targetLabels: string[];
  targetNumbers: number[];
  ambiguous: boolean;
  nextIssue?: string;
  nextSpecial?: number;
  nextZodiac?: string;
  success?: boolean;
  error?: string;
};

export type SpecialRuleScenario = {
  label: string;
  total: number;
  success: number;
  rate: number;
};

export type SpecialRuleReport = {
  spec: SpecialRuleSpec;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  recentTotal: number;
  recentSuccess: number;
  recentRate: number;
  currentStreak: number;
  currentStreakType: "success" | "failed" | "none";
  maxSuccessStreak: number;
  wrongIssues: string[];
  ambiguousCount: number;
  scenarios: SpecialRuleScenario[];
  details: SpecialRuleDetail[];
};

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

export type PositionNineGridTrigger = {
  previousDraw: DrawRecord;
  triggerDraw: DrawRecord;
  nextDraw?: DrawRecord;
  previousSpecial: number;
  positionIndex: number;
  columnIndexes: [number, number, number];
};

export function drawNumbers(draw: DrawRecord) {
  return [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
}

export function buildPositionNineGridTriggers(draws: DrawRecord[]): PositionNineGridTrigger[] {
  const sorted = sortDraws(draws);
  const triggers: PositionNineGridTrigger[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previousDraw = sorted[index - 1];
    const triggerDraw = sorted[index];
    const positionIndex = drawNumbers(triggerDraw).indexOf(previousDraw.special);
    if (positionIndex < 0) continue;

    const windowStart = Math.min(Math.max(positionIndex - 1, 0), 4);
    triggers.push({
      previousDraw,
      triggerDraw,
      nextDraw: sorted[index + 1],
      previousSpecial: previousDraw.special,
      positionIndex,
      columnIndexes: [windowStart, windowStart + 1, windowStart + 2],
    });
  }

  return triggers.reverse();
}

export const SPECIAL_RULE_SPECS: SpecialRuleSpec[] = [
  {
    id: "half-head-l",
    name: "杀半头 · L序",
    category: "杀半头",
    formula: "平2尾 + 平3尾 + 平6头 + 特码合",
    orderMode: "L",
    explanation: "计算结果取个位，再按固定的头数单双表映射到一组排除号码。",
  },
  {
    id: "half-head-d",
    name: "杀半头 · D序",
    category: "杀半头",
    formula: "平1头 + 平2头",
    orderMode: "D",
    explanation: "D序只排序6个平码，特码保持独立；结果取个位后映射到头数单双。",
  },
  {
    id: "kill-color",
    name: "杀一波 · L序",
    category: "杀一波",
    formula: "平1 + 平2五行值 + 平4头 + 平4波色值 + 平5段 + 特尾",
    orderMode: "L",
    explanation: "结果循环减3：0=红波、1=蓝波、2=绿波。",
  },
  {
    id: "kill-door",
    name: "杀一门 · L序",
    category: "杀一门",
    formula: "平2尾 + 平3尾 + 特码合 + 特码五行值 + 期数尾",
    orderMode: "L",
    explanation: "结果循环减5直到落在1-5，再映射到固定门数号码。",
  },
  {
    id: "seven-tail-d",
    name: "七尾新规 · D序",
    category: "七尾",
    formula: "平1尾 + 平5段 + 特码尾",
    orderMode: "D",
    explanation: "先取定位尾，再按 -4、-3、-1、+1、+3、+4、+5 做0-9闭环。",
  },
  {
    id: "kill-element-d",
    name: "杀一行 · D序",
    category: "杀一行",
    formula: "平2尾 + 平3尾 + 特码合 + 特码五行值",
    orderMode: "D",
    explanation: "结果循环减5落到1-5：金1、木2、水3、火4、土5。",
  },
];

const HALF_HEAD_LABELS: Record<number, string[]> = {
  0: ["4头双"],
  1: ["0头单"],
  2: ["0头双"],
  3: ["1头单"],
  4: ["1头双"],
  5: ["2头单"],
  6: ["3头单", "2头双"],
  8: ["3头双"],
  9: ["4头单"],
};

const DOOR_GROUPS: Record<number, number[]> = {
  1: range(1, 9),
  2: range(10, 18),
  3: range(19, 27),
  4: range(28, 37),
  5: range(38, 49),
};

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function sortDraws(draws: DrawRecord[]) {
  return [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function subtractSteps(raw: number, step: number, min: number, max: number) {
  const steps = [raw];
  let value = raw;
  while (value > max) {
    value -= step;
    steps.push(value);
  }
  while (value < min) {
    value += step;
    steps.push(value);
  }
  return { value, steps };
}

function halfHeadNumbers(label: string) {
  const match = label.match(/^(\d)头(单|双)$/);
  if (!match) return [];
  const head = Number(match[1]);
  const parity = match[2] === "单" ? 1 : 0;
  const from = head === 0 ? 1 : head * 10;
  const to = head === 4 ? 49 : head * 10 + 9;
  return range(from, to).filter((number) => number % 2 === parity);
}

function colorLabel(value: number, config: RuleQuantConfig) {
  const configured = Object.entries(config.colorValues).find(([, itemValue]) => itemValue === value)?.[0];
  return configured ? `${configured}波` : (["红波", "蓝波", "绿波"][value] ?? `${value}波`);
}

function colorNumbers(value: number, config: RuleQuantConfig) {
  const color = Object.entries(config.colorValues).find(([, itemValue]) => itemValue === value)?.[0];
  return color ? config.colorTable[color] ?? [] : [];
}

function resolveTarget(spec: SpecialRuleSpec, rawResult: number, config: RuleQuantConfig) {
  if (spec.id === "half-head-l" || spec.id === "half-head-d") {
    const normalizedValue = positiveModulo(rawResult, 10);
    const labels = HALF_HEAD_LABELS[normalizedValue] ?? [];
    return {
      normalizedValue,
      normalizerSteps: rawResult === normalizedValue ? [rawResult] : [rawResult, normalizedValue],
      targetLabels: labels,
      targetNumbers: [...new Set(labels.flatMap(halfHeadNumbers))],
      ambiguous: labels.length !== 1,
    };
  }

  if (spec.id === "kill-color") {
    const normalizedValue = positiveModulo(rawResult, 3);
    const steps = subtractSteps(rawResult, 3, 0, 2).steps;
    return {
      normalizedValue,
      normalizerSteps: steps,
      targetLabels: [colorLabel(normalizedValue, config)],
      targetNumbers: colorNumbers(normalizedValue, config),
      ambiguous: false,
    };
  }

  if (spec.id === "seven-tail-d") {
    const normalizedValue = positiveModulo(rawResult, 10);
    const offsets = [-4, -3, -1, 1, 3, 4, 5];
    const tails = offsets.map((offset) => positiveModulo(normalizedValue + offset, 10));
    return {
      normalizedValue,
      normalizerSteps: rawResult === normalizedValue ? [rawResult] : [rawResult, normalizedValue],
      targetLabels: [`七尾 ${tails.join("、")}`],
      targetNumbers: range(1, 49).filter((number) => tails.includes(number % 10)),
      ambiguous: false,
    };
  }

  if (spec.id === "kill-element-d") {
    const normalized = subtractSteps(rawResult, 5, 1, 5);
    const element = Object.entries(config.elementValues).find(([, value]) => value === normalized.value)?.[0];
    return {
      normalizedValue: normalized.value,
      normalizerSteps: normalized.steps,
      targetLabels: [`${element ?? normalized.value}行`],
      targetNumbers: element ? config.elementTable[element] ?? [] : [],
      ambiguous: false,
    };
  }

  const normalized = subtractSteps(rawResult, 5, 1, 5);
  return {
    normalizedValue: normalized.value,
    normalizerSteps: normalized.steps,
    targetLabels: [`${normalized.value}门`],
    targetNumbers: DOOR_GROUPS[normalized.value] ?? [],
    ambiguous: false,
  };
}

function rate(success: number, total: number) {
  return total ? Number(((success / total) * 100).toFixed(2)) : 0;
}

function streakSummary(details: SpecialRuleDetail[]) {
  const resolved = details.filter((detail): detail is SpecialRuleDetail & { success: boolean } => typeof detail.success === "boolean");
  if (!resolved.length) return { currentStreak: 0, currentStreakType: "none" as const, maxSuccessStreak: 0 };
  let maxSuccessStreak = 0;
  let running = 0;
  resolved.forEach((detail) => {
    running = detail.success ? running + 1 : 0;
    maxSuccessStreak = Math.max(maxSuccessStreak, running);
  });
  const latest = resolved.at(-1)!;
  let currentStreak = 0;
  for (let index = resolved.length - 1; index >= 0; index -= 1) {
    if (resolved[index].success !== latest.success) break;
    currentStreak += 1;
  }
  return { currentStreak, currentStreakType: latest.success ? "success" as const : "failed" as const, maxSuccessStreak };
}

function scenarioSummary(details: SpecialRuleDetail[], alternativeIndex: number, label: string): SpecialRuleScenario {
  const resolved = details.filter((detail) => detail.nextSpecial !== undefined && !detail.error);
  const values = resolved.map((detail) => {
    if (!detail.ambiguous) return !detail.targetNumbers.includes(detail.nextSpecial!);
    const targetLabel = detail.targetLabels[alternativeIndex];
    return targetLabel ? !halfHeadNumbers(targetLabel).includes(detail.nextSpecial!) : undefined;
  }).filter((value): value is boolean => typeof value === "boolean");
  const success = values.filter(Boolean).length;
  return { label, total: values.length, success, rate: rate(success, values.length) };
}

export function analyzeSpecialRule(specId: SpecialRuleId, draws: DrawRecord[], config: RuleQuantConfig): SpecialRuleReport {
  const spec = SPECIAL_RULE_SPECS.find((item) => item.id === specId) ?? SPECIAL_RULE_SPECS[0];
  const sorted = sortDraws(draws);
  const details = sorted.map((draw, index): SpecialRuleDetail => {
    const currentNumbers = [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
    try {
      const normalized = normalizeDraw(draw, config);
      const formula = evaluateFormulaExpression(spec.formula, normalized, config, spec.orderMode);
      const target = resolveTarget(spec, formula.value, config);
      const nextDraw = sorted[index + 1];
      const nextSpecial = nextDraw?.special;
      const success = nextSpecial === undefined || target.ambiguous
        ? undefined
        : spec.id === "seven-tail-d"
          ? target.targetNumbers.includes(nextSpecial)
          : !target.targetNumbers.includes(nextSpecial);
      return {
        currentIssue: draw.issue,
        currentNumbers,
        variables: formula.variables,
        expression: formula.expression,
        rawResult: formula.value,
        ...target,
        nextIssue: nextDraw?.issue,
        nextSpecial,
        nextZodiac: nextSpecial ? getNumberAttributes(nextSpecial, config).zodiac : undefined,
        success,
      };
    } catch (error) {
      return {
        currentIssue: draw.issue,
        currentNumbers,
        variables: {},
        expression: spec.formula,
        rawResult: 0,
        normalizedValue: 0,
        normalizerSteps: [],
        targetLabels: [],
        targetNumbers: [],
        ambiguous: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const resolved = details.filter((detail): detail is SpecialRuleDetail & { success: boolean } => typeof detail.success === "boolean");
  const success = resolved.filter((detail) => detail.success).length;
  const recent = resolved.slice(-10);
  const recentSuccess = recent.filter((detail) => detail.success).length;
  const streaks = streakSummary(details);
  const scenarios = spec.id.startsWith("half-head")
    ? [scenarioSummary(details, 0, "结果6按3头单"), scenarioSummary(details, 1, "结果6按2头双")]
    : [];

  return {
    spec,
    total: resolved.length,
    success,
    failed: resolved.length - success,
    successRate: rate(success, resolved.length),
    recentTotal: recent.length,
    recentSuccess,
    recentRate: rate(recentSuccess, recent.length),
    ...streaks,
    wrongIssues: resolved.filter((detail) => !detail.success).map((detail) => detail.nextIssue ?? detail.currentIssue),
    ambiguousCount: details.filter((detail) => detail.ambiguous && detail.nextSpecial !== undefined).length,
    scenarios,
    details,
  };
}

function stateFor(number: number, kind: BinaryTrendKind) {
  if (kind === "size") return number >= 25 ? 0 : 1;
  return number % 2 === 1 ? 0 : 1;
}

function labelsFor(kind: BinaryTrendKind): [string, string] {
  return kind === "size" ? ["大", "小"] : ["单", "双"];
}

type TrendModel = {
  label: string;
  predict: (states: number[]) => number;
};

function boundedProbability(value: number) {
  return Math.min(0.95, Math.max(0.05, value));
}

function frequencyProbability(states: number[], window: number) {
  const sample = states.slice(-window);
  if (!sample.length) return 0.5;
  return (sample.filter((state) => state === 0).length + 1) / (sample.length + 2);
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
    let matches = true;
    for (let offset = 0; offset < order; offset += 1) {
      if (states[index - order + offset] !== pattern[offset]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
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
  if (!states.length) {
    return { probabilities: [0.5, 0.5] as const, weights: TREND_MODELS.map((model) => ({ label: model.label, weight: 1 / TREND_MODELS.length })), trainingSamples: 0 };
  }

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
  const recent30 = states.slice(-30);
  const learned = learnedTrendProbability(states);
  const probabilities = learned.probabilities;
  let backtestTotal = 0;
  let backtestSuccess = 0;
  for (let index = Math.max(20, states.length - 100); index < states.length; index += 1) {
    const model = learnedTrendProbability(states.slice(0, index)).probabilities;
    const prediction = model[0] >= model[1] ? 0 : 1;
    backtestTotal += 1;
    if (prediction === states[index]) backtestSuccess += 1;
  }
  const current = states.at(-1);
  let currentStreak = 0;
  if (current !== undefined) {
    for (let index = states.length - 1; index >= 0; index -= 1) {
      if (states[index] !== current) break;
      currentStreak += 1;
    }
  }

  return {
    kind,
    title: kind === "size" ? "特码大小走势" : "特码单双走势",
    labels,
    sequence20: states.slice(-20).map((state) => labels[state]),
    sequence30: recent30.map((state) => labels[state]),
    currentLabel: current === undefined ? "-" : labels[current],
    currentStreak,
    probabilities: [
      { label: labels[0], probability: Number((probabilities[0] * 100).toFixed(2)) },
      { label: labels[1], probability: Number((probabilities[1] * 100).toFixed(2)) },
    ],
    backtestTotal,
    backtestSuccess,
    backtestRate: rate(backtestSuccess, backtestTotal),
    trainingSamples: learned.trainingSamples,
    confidence: Number((Math.abs(probabilities[0] - probabilities[1]) * 100).toFixed(2)),
    modelWeights: learned.weights
      .map((item) => ({ label: item.label, weight: Number((item.weight * 100).toFixed(1)) }))
      .sort((a, b) => b.weight - a.weight),
    explanation: "自适应模型会从历史数据学习近期频率、时间衰减、1至3阶走势和连开状态，并按滚动预测误差自动调整各模型权重；不是固定格式，仅用于走势研究。",
  };
}
