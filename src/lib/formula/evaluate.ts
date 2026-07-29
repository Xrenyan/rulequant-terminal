import { getNumberAttributes } from "@/lib/engine/attributes";
import type { FormulaEvaluation, NormalizedDraw, OrderMode, RuleQuantConfig } from "@/types/domain";

type Token = { type: "number" | "identifier" | "operator" | "paren"; value: string };

const FIXED_ZODIAC_POSITION_ORDER = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];

function normalizeFormulaText(formula: string) {
  return formula
    .replace(/([1-7])\uFE0F?\u20E3/g, "$1")
    .replace(/[，、；;]/g, "+");
}

function fixedZodiacPosition(number: number, config: RuleQuantConfig): number {
  const zodiac = getNumberAttributes(number, config).zodiac;
  const index = FIXED_ZODIAC_POSITION_ORDER.indexOf(zodiac);
  if (index < 0) throw new Error(`未知生肖位置：${zodiac}`);
  return index + 1;
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const char = formula[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let value = char;
      i += 1;
      while (i < formula.length && /[0-9.]/.test(formula[i])) {
        value += formula[i++];
      }
      tokens.push({ type: "number", value });
      continue;
    }
    if ("+-*/".includes(char)) {
      tokens.push({ type: "operator", value: char });
      i += 1;
      continue;
    }
    if ("()（）".includes(char)) {
      tokens.push({ type: "paren", value: char === "（" ? "(" : char === "）" ? ")" : char });
      i += 1;
      continue;
    }
    let value = char;
    i += 1;
    while (i < formula.length && !/\s/.test(formula[i]) && !/[+\-*/()（）]/.test(formula[i])) {
      value += formula[i++];
    }
    tokens.push({ type: "identifier", value });
  }
  return tokens;
}

function attrValue(name: string, number: number, config: RuleQuantConfig): number {
  const attrs = getNumberAttributes(number, config);
  const normalizedName = name.replace(/值$/, "");
  switch (normalizedName) {
    case "头":
      return attrs.head;
    case "尾":
      return attrs.tail;
    case "合":
    case "合数":
      return attrs.sum;
    case "合尾":
    case "合数尾":
      return attrs.sumTail;
    case "段":
      return attrs.segment;
    case "波":
    case "波色":
    case "波色值":
      return attrs.colorValue;
    case "单双":
    case "奇偶":
      return attrs.parity === "单" ? 1 : 2;
    case "头单":
    case "头数单":
      return attrs.headParityType === "头单" ? 1 : 0;
    case "头双":
    case "头数双":
      return attrs.headParityType === "头双" ? 1 : 0;
    case "大小":
      return attrs.size === "大" ? 1 : 0;
    case "行":
    case "五行":
    case "五行值":
      return attrs.elementValue;
    case "码":
    case "号码":
      return attrs.number;
    case "位":
    case "位置":
    case "肖位":
    case "生肖位":
      return fixedZodiacPosition(number, config);
    default:
      throw new Error(`未知属性函数：${name}`);
  }
}

function positionIndex(value: string): number | undefined {
  const map: Record<string, number> = {
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
  };
  return map[value];
}

function specialVariable(name: string, draw: NormalizedDraw): number | undefined {
  const attrs = draw.specialAttributes;
  const issueDigits = draw.issue.replace(/\D/g, "");
  const issuePeriodNumber = Number(issueDigits.slice(-3) || issueDigits || "0");
  const map: Record<string, number> = {
    特码: draw.special,
    特号: draw.special,
    特: draw.special,
    杀码: draw.special,
    特码头: attrs.head,
    特码尾: attrs.tail,
    特码合: attrs.sum,
    特码合尾: attrs.sumTail,
    特码段: attrs.segment,
    特码波: attrs.colorValue,
    特码波色: attrs.colorValue,
    特码波色值: attrs.colorValue,
    特码单双: attrs.parity === "单" ? 1 : 2,
    特码奇偶: attrs.parity === "单" ? 1 : 2,
    特码大小: attrs.size === "大" ? 1 : 0,
    特码行: attrs.elementValue,
    特码五行: attrs.elementValue,
    特码五行值: attrs.elementValue,
    总数: draw.total,
    总数尾: draw.totalTail,
    总数合: draw.totalSum,
    总分: draw.total,
    总分尾: draw.totalTail,
    总分合: draw.totalSum,
    期数: issuePeriodNumber,
    期号: issuePeriodNumber,
    期数尾: draw.issueTail,
    期号尾: draw.issueTail,
    期尾: draw.issueTail,
    期合: draw.issueSum,
    期合尾: draw.issueSumTail,
  };
  return map[name];
}

function resolveIdentifier(name: string, draw: NormalizedDraw, orderMode: OrderMode, config: RuleQuantConfig): number {
  const direct = specialVariable(name, draw);
  if (direct !== undefined) return direct;

  const order = orderMode === "D" ? draw.dOrder : draw.lOrder;
  const lMatch = name.match(/^L([1-7])$/i);
  if (lMatch) return draw.lOrder[Number(lMatch[1]) - 1];
  const dMatch = name.match(/^D([1-7])$/i);
  if (dMatch) return draw.dOrder[Number(dMatch[1]) - 1];

  const prefixedCodeMatch = name.match(/^(平|落)码([1-7一二三四五六七])(.+)?$/);
  if (prefixedCodeMatch) {
    const index = positionIndex(prefixedCodeMatch[2]);
    if (!index) throw new Error(`未知位置：${name}`);
    const baseNumber = prefixedCodeMatch[1] === "落" ? draw.lOrder[index - 1] : order[index - 1];
    const suffix = prefixedCodeMatch[3];
    return suffix ? attrValue(suffix, baseNumber, config) : baseNumber;
  }

  const positionMatch = name.match(/^(平|落)([1-7一二三四五六七])$/);
  if (positionMatch) {
    const index = positionIndex(positionMatch[2]);
    if (!index) throw new Error(`未知位置：${name}`);
    if (positionMatch[1] === "落") return draw.lOrder[index - 1];
    return order[index - 1];
  }

  const positionAttrMatch = name.match(/^(平|落)([1-7一二三四五六七])(.+)$/);
  if (positionAttrMatch) {
    const index = positionIndex(positionAttrMatch[2]);
    if (!index) throw new Error(`未知位置：${name}`);
    const baseNumber = positionAttrMatch[1] === "落" ? draw.lOrder[index - 1] : order[index - 1];
    return attrValue(positionAttrMatch[3], baseNumber, config);
  }

  const specialAttrMatch = name.match(/^特(?:码)?(.+)$/);
  if (specialAttrMatch) {
    return attrValue(specialAttrMatch[1], draw.special, config);
  }

  throw new Error(`未知变量：${name}`);
}

export function evaluateFormula(
  formula: string,
  draw: NormalizedDraw,
  config: RuleQuantConfig,
  orderMode: OrderMode,
): FormulaEvaluation {
  const expression = normalizeFormulaText(formula);
  const tokens = tokenize(expression);
  let index = 0;
  const variables: Record<string, number> = {};
  const trace: string[] = [];

  function peek(): Token | undefined {
    return tokens[index];
  }

  function consume(): Token {
    const token = tokens[index];
    index += 1;
    if (!token) throw new Error("公式意外结束");
    return token;
  }

  function parsePrimary(): number {
    const token = consume();
    if (token.type === "number") return Number(token.value);
    if (token.type === "paren" && token.value === "(") {
      const value = parseExpression();
      const close = consume();
      if (close.value !== ")") throw new Error("括号未闭合");
      return value;
    }
    if (token.type === "operator" && token.value === "-") {
      return -parsePrimary();
    }
    if (token.type === "identifier") {
      if (peek()?.type === "paren" && peek()?.value === "(") {
        consume();
        const startIndex = index;
        const argValue = parseExpression();
        const close = consume();
        if (close.value !== ")") throw new Error("属性函数括号未闭合");
        const argText = tokens.slice(startIndex, index - 1).map((item) => item.value).join("");
        const key = `${token.value}(${argText})`;
        const value = attrValue(token.value, argValue, config);
        variables[key] = value;
        trace.push(`${key} = ${value}`);
        return value;
      }
      const value = resolveIdentifier(token.value, draw, orderMode, config);
      variables[token.value] = value;
      trace.push(`${token.value} = ${value}`);
      return value;
    }
    throw new Error(`公式无法解析：${token.value}`);
  }

  function parseTerm(): number {
    let value = parsePrimary();
    while (peek()?.type === "operator" && "*/".includes(peek()!.value)) {
      const operator = consume().value;
      const right = parsePrimary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (peek()?.type === "operator" && "+-".includes(peek()!.value)) {
      const operator = consume().value;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const value = parseExpression();
  if (index < tokens.length) {
    throw new Error(`公式存在未消费片段：${tokens.slice(index).map((item) => item.value).join("")}`);
  }

  return { value, expression, variables, trace };
}
