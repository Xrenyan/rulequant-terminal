import type { DrawRecord, NormalizedDraw, NumberAttributes, RuleQuantConfig } from "@/types/domain";

export function digitSum(value: number): number {
  return Math.abs(value)
    .toString()
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
}

function lookupNumber(table: Record<string, number[]>, value: number): string {
  const match = Object.entries(table).find(([, numbers]) => numbers.includes(value));
  if (!match) {
    throw new Error(`号码 ${value} 不在配置表中`);
  }
  return match[0];
}

export function getNumberAttributes(number: number, config: RuleQuantConfig): NumberAttributes {
  if (!Number.isInteger(number) || number < 1 || number > 49) {
    throw new Error(`号码必须在 1-49 之间，当前为 ${number}`);
  }

  const head = Math.floor(number / 10);
  const tail = number % 10;
  const sum = digitSum(number);
  const sumTail = sum % 10;
  const segment = config.segmentRanges.find((range) => number >= range.from && number <= range.to)?.label;
  const zodiac = lookupNumber(config.zodiacTable, number);
  const color = lookupNumber(config.colorTable, number);
  const element = lookupNumber(config.elementTable, number);
  const headParityType = number % 2 === 0 ? "头双" : "头单";

  if (!segment) {
    throw new Error(`号码 ${number} 未匹配段位`);
  }

  return {
    number,
    head,
    tail,
    sum,
    sumTail,
    segment,
    zodiac,
    color,
    colorValue: config.colorValues[color],
    element,
    elementValue: config.elementValues[element],
    parity: number % 2 === 0 ? "双" : "单",
    size: number >= 25 ? "大" : "小",
    headParity: `${head}${headParityType}`,
    headParityType,
  };
}

type RawBallAttributes = {
  number?: unknown;
  zodiac?: unknown;
  color?: unknown;
  element?: unknown;
};

function rawBallMap(draw: DrawRecord): Map<number, RawBallAttributes> {
  const balls = draw.rawAttributes?.balls;
  if (!Array.isArray(balls)) return new Map();
  return new Map(
    balls
      .filter((ball): ball is RawBallAttributes => Boolean(ball) && typeof ball === "object")
      .map((ball) => [Number(ball.number), ball]),
  );
}

function applyRawAttributes(attributes: NumberAttributes, raw: RawBallAttributes | undefined, config: RuleQuantConfig): NumberAttributes {
  if (!raw) return attributes;
  const zodiac = typeof raw.zodiac === "string" && raw.zodiac ? raw.zodiac : attributes.zodiac;
  const color = typeof raw.color === "string" && raw.color ? raw.color : attributes.color;
  const element = typeof raw.element === "string" && raw.element ? raw.element : attributes.element;
  return {
    ...attributes,
    zodiac,
    color,
    colorValue: config.colorValues[color] ?? attributes.colorValue,
    element,
    elementValue: config.elementValues[element] ?? attributes.elementValue,
  };
}

export function normalizeDraw(draw: DrawRecord, config: RuleQuantConfig): NormalizedDraw {
  const lOrder = [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
  const dOrder = [[draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6].sort((a, b) => a - b), [draw.special]].flat();
  const rawAttributesByNumber = rawBallMap(draw);
  const attributes = lOrder.map((number) => applyRawAttributes(getNumberAttributes(number, config), rawAttributesByNumber.get(number), config));
  const total = lOrder.reduce((sum, number) => sum + number, 0);
  const issueDigits = draw.issue.replace(/\D/g, "");
  const issuePeriodNumber = Number(issueDigits.slice(-3) || issueDigits || "0");
  const issueSum = digitSum(issuePeriodNumber);

  return {
    ...draw,
    lOrder,
    dOrder,
    attributes,
    specialAttributes: attributes[6],
    total,
    totalTail: total % 10,
    totalSum: digitSum(total),
    issueTail: issuePeriodNumber % 10,
    issueSum,
    issueSumTail: issueSum % 10,
  };
}

function reduceBy(
  raw: number,
  step: number,
  maxExclusive: number,
  minInclusive: number,
): { value: number; steps: number[] } {
  const steps = [raw];
  let value = raw;
  while (value >= maxExclusive) {
    value -= step;
    steps.push(value);
  }
  while (value < minInclusive) {
    value += step;
    steps.push(value);
  }
  return { value, steps };
}

export function normalizeZodiacNumber(raw: number): { value: number; steps: number[] } {
  const steps = [raw];
  let value = raw;
  while (value > 49) {
    value -= 48;
    steps.push(value);
  }
  while (value < 1) {
    value += 48;
    steps.push(value);
  }
  return { value, steps };
}

export function normalizeSum(raw: number): { value: number; steps: number[] } {
  return reduceBy(raw, 13, 14, 1);
}

export function normalizeTail(raw: number): { value: number; steps: number[] } {
  return { value: ((raw % 10) + 10) % 10, steps: [raw, ((raw % 10) + 10) % 10] };
}

export function normalizeHead(raw: number): { value: number; steps: number[] } {
  return reduceBy(raw, 5, 5, 0);
}

export function normalizeElement(raw: number): { value: number; steps: number[] } {
  const steps = [raw];
  let value = raw;
  while (value > 5) {
    value -= 5;
    steps.push(value);
  }
  while (value < 1) {
    value += 5;
    steps.push(value);
  }
  return { value, steps };
}

export function normalizeSegment(raw: number): { value: number; steps: number[] } {
  return reduceBy(raw, 7, 8, 1);
}
