import {
  getNumberAttributes,
  normalizeElement,
  normalizeHead,
  normalizeSegment,
  normalizeSum,
  normalizeTail,
  normalizeZodiacNumber,
} from "@/lib/engine/attributes";
import { evaluateFormula } from "@/lib/formula/evaluate";
import type {
  BacktestDetail,
  FutureCheck,
  NormalizedDraw,
  RuleCalculation,
  RuleQuantConfig,
  RuleRecord,
} from "@/types/domain";

export type CalculateRuleContext = {
  periodIndex?: number;
};

export type FormulaEngineCalculation = RuleCalculation & {
  variables: Record<string, number>;
  expression: string;
  trace: string[];
  legacyProcess?: string[];
};

const calculationCache = new Map<string, FormulaEngineCalculation>();

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneCalculation(calculation: FormulaEngineCalculation): FormulaEngineCalculation {
  const finalResult =
    Array.isArray(calculation.finalResult)
      ? typeof calculation.finalResult[0] === "number"
        ? [...calculation.finalResult] as number[]
        : [...calculation.finalResult] as string[]
      : calculation.finalResult;

  return {
    ...calculation,
    normalizerSteps: [...calculation.normalizerSteps],
    finalResult,
    mappedResult: [...calculation.mappedResult],
    secondaryMappedResult: calculation.secondaryMappedResult ? [...calculation.secondaryMappedResult] : undefined,
    process: [...calculation.process],
    variables: { ...calculation.variables },
    trace: [...calculation.trace],
  };
}

function ruleCacheSignature(rule: RuleRecord): unknown {
  return {
    id: rule.id,
    updatedAt: rule.updatedAt,
    category: rule.category,
    orderMode: rule.orderMode,
    formula: rule.formula,
    normalizer: rule.normalizer,
    target: rule.target,
    positionPattern: rule.positionPattern,
    anchorIssue: rule.anchorIssue,
    anchorPatternIndex: rule.anchorPatternIndex,
    periodSpan: rule.periodSpan,
    verifyOffset: rule.verifyOffset,
  };
}

function drawCacheSignature(draw: NormalizedDraw): unknown {
  return {
    issue: draw.issue,
    lOrder: draw.lOrder,
    dOrder: draw.dOrder,
    special: draw.special,
    total: draw.total,
    issueSum: draw.issueSum,
  };
}

function configCacheSignature(config: RuleQuantConfig): unknown {
  return {
    zodiacTable: config.zodiacTable,
    zodiacOrder: config.zodiacOrder,
    zodiacClash: config.zodiacClash,
    colorTable: config.colorTable,
    colorValues: config.colorValues,
    elementTable: config.elementTable,
    elementValues: config.elementValues,
    segmentRanges: config.segmentRanges,
    sevenTailOffsets: config.sevenTailOffsets,
  };
}

function cacheKey(rule: RuleRecord, current: NormalizedDraw, config: RuleQuantConfig, context: CalculateRuleContext): string {
  return stableStringify({
    rule: ruleCacheSignature(rule),
    draw: drawCacheSignature(current),
    config: configCacheSignature(config),
    context: { periodIndex: context.periodIndex ?? null },
  });
}

export function clearFormulaEngineCache(): void {
  calculationCache.clear();
}

export function getFormulaEngineCacheSize(): number {
  return calculationCache.size;
}

function reductionProcess(steps: number[], stepLabel: number): string[] {
  if (steps.length <= 1) return [`取值 ${steps[0]}`];
  return steps.slice(0, -1).map((value, index) => `${value} - ${stepLabel} = ${steps[index + 1]}`);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function zodiacAtOffset(zodiac: string, offset: number, config: RuleQuantConfig): string {
  const index = config.zodiacOrder.indexOf(zodiac);
  if (index < 0) throw new Error(`未知生肖：${zodiac}`);
  return config.zodiacOrder[(index + offset + config.zodiacOrder.length) % config.zodiacOrder.length];
}

function calcEightZodiac(start: string, config: RuleQuantConfig): string[] {
  const next2 = zodiacAtOffset(start, 2, config);
  const next4 = zodiacAtOffset(start, 4, config);
  return unique([
    start,
    zodiacAtOffset(start, 1, config),
    next2,
    config.zodiacClash[next2],
    zodiacAtOffset(start, 3, config),
    next4,
    config.zodiacClash[next4],
    zodiacAtOffset(start, 5, config),
  ]);
}

function calcNineZodiac(start: string, config: RuleQuantConfig): string[] {
  const next2 = zodiacAtOffset(start, 2, config);
  const next4 = zodiacAtOffset(start, 4, config);
  return unique([
    start,
    config.zodiacClash[start],
    zodiacAtOffset(start, 1, config),
    next2,
    config.zodiacClash[next2],
    zodiacAtOffset(start, 3, config),
    next4,
    config.zodiacClash[next4],
    zodiacAtOffset(start, 5, config),
  ]);
}

function calcEightZodiacTwoPeriod(center: string, config: RuleQuantConfig): string[] {
  return unique([
    zodiacAtOffset(center, -3, config),
    zodiacAtOffset(center, -2, config),
    zodiacAtOffset(center, -1, config),
    center,
    zodiacAtOffset(center, 1, config),
    zodiacAtOffset(center, 2, config),
    zodiacAtOffset(center, 3, config),
    config.zodiacClash[center],
  ]);
}

function calcKillThree(center: string, config: RuleQuantConfig): string[] {
  const next = zodiacAtOffset(center, 1, config);
  return unique([center, next, config.zodiacClash[next]]);
}

function closedTail(baseTail: number, offset: number): number {
  return ((baseTail + offset) % 10 + 10) % 10;
}

function closedZodiacNumber(base: number, offset: number): number {
  let value = Math.round(base) + offset;
  while (value < 1) value += 12;
  while (value > 49) value -= 12;
  return value;
}

function parseSignedOffsets(value: string): number[] {
  const explicit = [...value.matchAll(/[+-]?\d+/g)].map((match) => Number(match[0])).filter(Number.isFinite);
  return explicit;
}

function parseCompactZodiacOffsets(value: string): number[] {
  const compact = value.replace(/[^\d]/g, "");
  if (compact === "1234567911") return [1, 2, 3, 4, 5, 6, 7, 9, 11];
  if (!compact) return [];
  const offsets: number[] = [];
  let index = 0;
  while (index < compact.length) {
    const two = compact.slice(index, index + 2);
    if ((two === "10" || two === "11" || two === "12") && index > 0) {
      offsets.push(Number(two));
      index += 2;
    } else {
      offsets.push(Number(compact[index]));
      index += 1;
    }
  }
  return offsets.filter(Number.isFinite);
}

function tailOffsetsForRule(rule: RuleRecord, config: RuleQuantConfig): number[] {
  const normalizer = rule.normalizer ?? "";
  const leftRight = normalizer.match(/left\s*=?\s*(\d+).*right\s*=?\s*(\d+)/i) ?? normalizer.match(/left(\d+).*right(\d+)/i);
  if (leftRight) {
    const left = Number(leftRight[1]);
    const right = Number(leftRight[2]);
    return Array.from({ length: left + right + 1 }, (_, index) => index - left);
  }
  if (/tail_(?:window|offsets)\s*:/i.test(normalizer)) {
    const [, value = ""] = normalizer.split(/tail_(?:window|offsets)\s*:/i);
    const offsets = parseSignedOffsets(value);
    if (offsets.length) return offsets;
  }
  return config.sevenTailOffsets;
}

function zodiacOffsetsForRule(rule: RuleRecord): number[] {
  const normalizer = rule.normalizer ?? "";
  const match = normalizer.match(/zodiac_offsets\s*:?\s*([+\-\d,\s.]+)/i);
  if (!match) return [];
  const source = match[1].trim();
  if (/^[+]?\d+$/.test(source)) return parseCompactZodiacOffsets(source);
  return parseSignedOffsets(source);
}

function calcZodiacOffsetSet(baseNumber: number, offsets: number[], config: RuleQuantConfig): { numbers: number[]; zodiacs: string[]; lines: string[] } {
  const base = normalizeZodiacNumber(Math.round(baseNumber)).value;
  const numbers = unique(offsets.map((offset) => closedZodiacNumber(base, offset)));
  const zodiacs = unique(numbers.map((number) => getNumberAttributes(number, config).zodiac));
  const lines = offsets.map((offset) => {
    const wrapped = closedZodiacNumber(base, offset);
    const sign = offset >= 0 ? `+${offset}` : String(offset);
    return `${String(base).padStart(2, "0")} ${getNumberAttributes(base, config).zodiac} ${sign} -> ${String(wrapped).padStart(2, "0")} ${getNumberAttributes(wrapped, config).zodiac}`;
  });
  return { numbers, zodiacs, lines };
}

function shouldApplyPositionPattern(rule: RuleRecord): boolean {
  return rule.positionPattern.length > 0;
}

function issueSuffix(issue: string): number | undefined {
  const digits = issue.replace(/\D/g, "");
  if (!digits) return undefined;
  return Number(digits.slice(-3));
}

function periodPosition(
  rule: RuleRecord,
  current: NormalizedDraw,
  context: CalculateRuleContext,
): { position: number; patternIndex: number; periodIndex: number } | null {
  if (!shouldApplyPositionPattern(rule)) return null;
  const anchorIssue = rule.anchorIssue ? issueSuffix(rule.anchorIssue) : undefined;
  const currentIssue = issueSuffix(current.issue);
  const anchorPatternIndex = rule.anchorPatternIndex ?? 0;
  const periodIndex =
    anchorIssue !== undefined && currentIssue !== undefined && currentIssue >= 100
      ? currentIssue - anchorIssue + anchorPatternIndex
      : context.periodIndex ?? 0;
  const patternIndex = ((periodIndex % rule.positionPattern.length) + rule.positionPattern.length) % rule.positionPattern.length;
  const position = rule.positionPattern[patternIndex];
  if (!Number.isInteger(position) || position < 1 || position > 7) {
    throw new Error(`取位序列只能使用 1-7，当前为 ${position}`);
  }
  return { position, patternIndex, periodIndex };
}

function formulaForPeriod(
  rule: RuleRecord,
  current: NormalizedDraw,
  context: CalculateRuleContext,
): { formula: string; patternTrace: string[]; position: ReturnType<typeof periodPosition> } {
  const position = periodPosition(rule, current, context);
  if (!position) return { formula: rule.formula, patternTrace: [], position };
  const formula = rule.formula.replace(/([平落])([1-7])/g, (_match, prefix) => `${prefix}${position.position}`);
  return {
    formula,
    patternTrace: [`取位循环：第 ${position.periodIndex + 1} 期使用序列第 ${position.patternIndex + 1} 位 -> ${formula}`],
    position,
  };
}

function incrementNumber(raw: number, amount: number): number {
  const rounded = Math.round(raw);
  return ((rounded - 1 + amount) % 49 + 49) % 49 + 1;
}

function parityLabel(value: number): "单" | "双" {
  return Math.round(value) % 2 === 0 ? "双" : "单";
}

function parityAdjustment(rule: RuleRecord, position: ReturnType<typeof periodPosition>): number {
  if (!position || !rule.normalizer.includes("4455")) return 0;
  if (position.position === 4) return 1;
  if (position.position === 5) return 2;
  return 0;
}

function calculateRuleUncached(
  rule: RuleRecord,
  current: NormalizedDraw,
  config: RuleQuantConfig,
  context: CalculateRuleContext = {},
): FormulaEngineCalculation {
  const dynamicFormula = formulaForPeriod(rule, current, context);
  const formula = evaluateFormula(dynamicFormula.formula, current, config, rule.orderMode);
  const rawResult = formula.value;
  const trace = [...dynamicFormula.patternTrace, ...formula.trace];

  switch (rule.category) {
    case "kill_zodiac": {
      const normalized = normalizeZodiacNumber(rawResult);
      const zodiac = getNumberAttributes(normalized.value, config).zodiac;
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [zodiac],
        process: [...trace, ...reductionProcess(normalized.steps, 48), `${normalized.value} = ${zodiac}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "include_zodiac": {
      const normalized = normalizeZodiacNumber(rawResult);
      const zodiac = getNumberAttributes(normalized.value, config).zodiac;
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [zodiac],
        process: [...trace, ...reductionProcess(normalized.steps, 48), `${normalized.value} = ${zodiac}`, `参考生肖 ${zodiac}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_color":
    case "include_color": {
      const normalized = normalizeZodiacNumber(rawResult);
      const color = getNumberAttributes(normalized.value, config).color;
      const actionLabel = rule.category === "kill_color" ? "杀波色" : "参考波色";
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [color],
        process: [...trace, ...reductionProcess(normalized.steps, 48), `${normalized.value} = ${color}`, `${actionLabel} ${color}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_parity":
    case "include_parity": {
      const adjustment = parityAdjustment(rule, dynamicFormula.position);
      const adjusted = Math.round(rawResult) + adjustment;
      const parity = parityLabel(adjusted);
      const actionLabel = rule.category === "kill_parity" ? "杀单双" : "参考单双";
      return {
        rawResult,
        normalizerSteps: adjustment ? [rawResult, adjusted] : [rawResult],
        finalResult: adjusted,
        mappedResult: [parity],
        process: [
          ...trace,
          adjustment ? `${rawResult} + ${adjustment} = ${adjusted}` : `取值 ${rawResult}`,
          `${adjusted} = ${parity}`,
          `${actionLabel} ${parity}`,
        ],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_size":
    case "include_size": {
      const normalized = normalizeZodiacNumber(rawResult);
      const size = getNumberAttributes(normalized.value, config).size;
      const actionLabel = rule.category === "kill_size" ? "杀大小" : "参考大小";
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [size],
        process: [...trace, ...reductionProcess(normalized.steps, 48), `${normalized.value} = ${size}`, `${actionLabel} ${size}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_sum": {
      const normalized = normalizeSum(rawResult);
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [normalized.value],
        process: [...trace, ...reductionProcess(normalized.steps, 13), `杀合 ${normalized.value}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_tail": {
      const normalized = normalizeTail(rawResult);
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [normalized.value],
        process: [...trace, `${rawResult} % 10 = ${normalized.value}`, `杀尾 ${normalized.value}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_head": {
      const normalized = normalizeHead(rawResult);
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [normalized.value],
        process: [...trace, ...reductionProcess(normalized.steps, 5), `杀头 ${normalized.value}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_element": {
      const normalized = normalizeElement(rawResult);
      const element = Object.entries(config.elementValues).find(([, value]) => value === normalized.value)?.[0] ?? String(normalized.value);
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [element],
        process: [...trace, ...reductionProcess(normalized.steps, 5), `${normalized.value} = ${element}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_segment": {
      const normalized = normalizeSegment(rawResult);
      return {
        rawResult,
        normalizerSteps: normalized.steps,
        finalResult: normalized.value,
        mappedResult: [normalized.value],
        process: [...trace, ...reductionProcess(normalized.steps, 7), `杀段 ${normalized.value}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "seven_tail": {
      const baseTail = normalizeTail(rawResult).value;
      const offsets = tailOffsetsForRule(rule, config);
      const tails = offsets.map((offset) => closedTail(baseTail, offset));
      const tailProcess = [
        ...trace,
        `七尾闭环基准尾 ${baseTail}`,
        `0-9 闭环偏移 ${offsets.map((offset) => `${offset >= 0 ? "+" : ""}${offset}`).join(", ")} -> ${tails.join(", ")}`,
        ...offsets.map((offset) => `${baseTail} ${offset >= 0 ? "+" : ""}${offset} -> ${closedTail(baseTail, offset)}`),
      ];
      return {
        rawResult,
        normalizerSteps: [rawResult, baseTail],
        finalResult: tails,
        mappedResult: tails,
        process: tailProcess,
        legacyProcess: [
          ...trace,
          `定位尾 = ${rawResult} % 10 = ${baseTail}`,
          `七尾偏移 ${config.sevenTailOffsets.join(", ")} -> ${tails.join(", ")}`,
        ],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "eight_zodiac": {
      const startNumber = incrementNumber(rawResult, 1);
      const start = getNumberAttributes(startNumber, config).zodiac;
      const set = calcEightZodiac(start, config);
      return {
        rawResult,
        normalizerSteps: [rawResult, startNumber],
        finalResult: set,
        mappedResult: set,
        process: [...trace, `${rawResult} + 1 = ${startNumber}`, `${startNumber} = ${start}`, `八肖 = ${set.join(", ")}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "nine_zodiac": {
      const offsets = zodiacOffsetsForRule(rule);
      if (offsets.length) {
        const set = calcZodiacOffsetSet(rawResult, offsets, config);
        return {
          rawResult,
          normalizerSteps: [rawResult, normalizeZodiacNumber(Math.round(rawResult)).value],
          finalResult: set.zodiacs,
          mappedResult: set.zodiacs,
          secondaryMappedResult: set.numbers,
          process: [...trace, `生肖闭环取值 ${offsets.map((offset) => `${offset >= 0 ? "+" : ""}${offset}`).join(", ")}`, ...set.lines, `九肖 = ${set.zodiacs.join(", ")}`],
          variables: formula.variables,
          expression: formula.expression,
          trace,
        };
      }
      const startNumber = incrementNumber(rawResult, 1);
      const start = getNumberAttributes(startNumber, config).zodiac;
      const set = calcNineZodiac(start, config);
      return {
        rawResult,
        normalizerSteps: [rawResult, startNumber],
        finalResult: set,
        mappedResult: set,
        process: [...trace, `${rawResult} + 1 = ${startNumber}`, `${startNumber} = ${start}`, `九肖 = ${set.join(", ")}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "eight_zodiac_two_period": {
      const center = getNumberAttributes(Math.round(rawResult), config).zodiac;
      const set = calcEightZodiacTwoPeriod(center, config);
      return {
        rawResult,
        normalizerSteps: [rawResult],
        finalResult: set,
        mappedResult: set,
        process: [...trace, `${rawResult} = ${center}`, `八肖管两期 = ${set.join(", ")}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    case "kill_three_as_nine": {
      const center = getNumberAttributes(Math.round(rawResult), config).zodiac;
      const killSet = calcKillThree(center, config);
      const nineSet = config.zodiacOrder.filter((zodiac) => !killSet.includes(zodiac));
      return {
        rawResult,
        normalizerSteps: [rawResult],
        finalResult: nineSet,
        mappedResult: nineSet,
        secondaryMappedResult: killSet,
        process: [...trace, `${rawResult} = ${center}`, `杀三肖 = ${killSet.join(", ")}`, `九肖候选 = ${nineSet.join(", ")}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
    }
    default:
      return {
        rawResult,
        normalizerSteps: [rawResult],
        finalResult: rawResult,
        mappedResult: [rawResult],
        process: [...trace, `自定义结果 ${rawResult}`],
        variables: formula.variables,
        expression: formula.expression,
        trace,
      };
  }
}

export function calculateRule(
  rule: RuleRecord,
  current: NormalizedDraw,
  config: RuleQuantConfig,
  context: CalculateRuleContext = {},
): FormulaEngineCalculation {
  const key = cacheKey(rule, current, config, context);
  const cached = calculationCache.get(key);
  if (cached) return cloneCalculation(cached);
  const calculation = calculateRuleUncached(rule, current, config, context);
  calculationCache.set(key, cloneCalculation(calculation));
  return cloneCalculation(calculation);
}

export function checkRuleSuccess(rule: RuleRecord, calculation: RuleCalculation, future: NormalizedDraw): boolean {
  const resultSet = calculation.mappedResult;
  const special = future.specialAttributes;
  switch (rule.category) {
    case "kill_zodiac":
      return !resultSet.includes(special.zodiac);
    case "include_zodiac":
      return resultSet.includes(special.zodiac);
    case "kill_color":
      return !resultSet.includes(special.color);
    case "include_color":
      return resultSet.includes(special.color);
    case "kill_parity":
      return !resultSet.includes(special.parity);
    case "include_parity":
      return resultSet.includes(special.parity);
    case "kill_size":
      return !resultSet.includes(special.size);
    case "include_size":
      return resultSet.includes(special.size);
    case "kill_sum":
      return !resultSet.includes(special.sum);
    case "kill_tail":
      return !resultSet.includes(special.tail);
    case "kill_head":
      return !resultSet.includes(special.head);
    case "kill_element":
      return !resultSet.includes(special.element);
    case "kill_segment":
      return !resultSet.includes(special.segment);
    case "seven_tail":
      return resultSet.includes(special.tail);
    case "eight_zodiac":
    case "eight_zodiac_two_period":
    case "nine_zodiac":
    case "kill_three_as_nine":
      return resultSet.includes(special.zodiac);
    default:
      return resultSet.includes(special.number);
  }
}

export function targetLabel(rule: RuleRecord, calculation: RuleCalculation): string {
  const value = calculation.mappedResult.join("、");
  if (rule.category.startsWith("kill_") && rule.category !== "kill_three_as_nine") return `要杀：${value}`;
  if (rule.category.startsWith("include_")) return `参考：${value}`;
  if (rule.category === "nine_zodiac") return `九肖候选：${value}`;
  if (rule.category === "kill_three_as_nine") return `九肖候选：${value}`;
  return `候选集合：${value}`;
}

export function calculateRuleDetail(input: {
  rule: RuleRecord;
  current: NormalizedDraw;
  futureDraws: NormalizedDraw[];
  config: RuleQuantConfig;
  periodIndex: number;
}): BacktestDetail {
  const calculation = calculateRule(input.rule, input.current, input.config, { periodIndex: input.periodIndex });
  const futureChecks: FutureCheck[] = input.futureDraws.map((future) => ({
    issue: future.issue,
    special: future.special,
    specialAttributes: future.specialAttributes,
    success: checkRuleSuccess(input.rule, calculation, future),
  }));
  const verifyIndex = Math.max(input.rule.verifyOffset ?? 1, 1) - 1;
  const success =
    futureChecks.length === 0
      ? true
      : input.rule.category === "eight_zodiac_two_period"
        ? futureChecks.every((item) => item.success)
        : futureChecks[verifyIndex]?.success ?? false;
  const next = input.futureDraws[verifyIndex] ?? input.futureDraws[0];

  return {
    ruleId: input.rule.id,
    ruleName: input.rule.name,
    currentIssue: input.current.issue,
    currentNumbers: input.current.lOrder,
    lOrder: input.current.lOrder,
    dOrder: input.current.dOrder,
    formula: calculation.expression,
    variables: calculation.variables,
    expression: calculation.expression,
    process: calculation.process,
    rawResult: calculation.rawResult,
    normalizerSteps: calculation.normalizerSteps,
    finalResult: calculation.finalResult,
    mappedResult: calculation.mappedResult,
    secondaryMappedResult: calculation.secondaryMappedResult,
    targetLabel: targetLabel(input.rule, calculation),
    nextIssue: next?.issue,
    nextNumbers: next?.lOrder,
    nextSpecialAttributes: next?.specialAttributes,
    futureChecks,
    success,
  };
}
