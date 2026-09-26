import type { RuleRecord } from "@/types/domain";

export type PastedKillNumberRule =
  | { status: "ready"; draft: Partial<RuleRecord> }
  | { status: "error"; message: string };

// Check the complete arithmetic grammar; variable meanings are checked by the editor's trial calculation.
function completeArithmetic(formula: string): boolean {
  const expression = formula;
  const tokenPattern = /\d+(?:\.\d+)?|[\p{Script=Han}A-Za-z_][\p{Script=Han}A-Za-z_0-9]*|[+\-*/()]/uy;
  const tokens: string[] = [];
  let consumed = 0;
  while (consumed < expression.length) {
    if (/\s/.test(expression[consumed])) {
      consumed += 1;
      continue;
    }
    tokenPattern.lastIndex = consumed;
    const token = tokenPattern.exec(expression);
    if (!token || tokens.length >= 512) return false;
    tokens.push(token[0]);
    consumed = tokenPattern.lastIndex;
  }
  let index = 0;
  function primary(): boolean {
    const token = tokens[index++];
    if (!token) return false;
    if (token === "+" || token === "-") return primary();
    if (token === "(") return expressionPart() && tokens[index++] === ")";
    if (/^[*/)]$/.test(token)) return false;
    if (/^[\p{Script=Han}A-Za-z_]/u.test(token) && tokens[index] === "(") {
      index += 1;
      return expressionPart() && tokens[index++] === ")";
    }
    return true;
  }
  function term(): boolean {
    if (!primary()) return false;
    while (tokens[index] === "*" || tokens[index] === "/") {
      index += 1;
      if (!primary()) return false;
    }
    return true;
  }
  function expressionPart(): boolean {
    if (!term()) return false;
    while (tokens[index] === "+" || tokens[index] === "-") {
      index += 1;
      if (!term()) return false;
    }
    return true;
  }
  return expressionPart() && index === tokens.length;
}

/** Explicit number-exclusion formulas must use the full editor, never the single-position template. */
export function parsePastedKillNumberRule(source: string): PastedKillNumberRule | null {
  if (!/杀(?:一?个?)?特码|杀特号/.test(source)) return null;
  const error = (message: string): PastedKillNumberRule => ({ status: "error", message });
  const text = source.trim();
  const header = text.match(/^(?:第?\s*(\d+)\s*[.、号条]?\s*)?(?:计算类型\s*[:：]\s*)?(?:杀(?:一?个?)?特码|杀特号)/);
  if (!header) return error("请以“杀特码”或“177杀特码[D序]”开头，一次识别一条完整公式。");
  const orderHeader = /^(?:号码顺序\s*[:：]\s*)?(?:[\[【（(]\s*)?([LD])\s*序(?:\s*[\]】）)])?/i;
  const orderLine = /^\s*号码顺序\s*[:：]\s*([LD])\s*序\s*$/gim;
  let body = text.slice(header[0].length).trim();
  const orders = new Set<string>();
  for (let match = body.match(orderHeader); match; match = body.match(orderHeader)) {
    orders.add(match[1].toUpperCase());
    body = body.slice(match[0].length).trim();
  }
  body = body.replace(orderLine, (_line, order: string) => {
    orders.add(order.toUpperCase());
    return "\n";
  });
  if (orders.size > 1) return error("原文同时包含L序和D序，请保留这条公式实际使用的一种顺序。");
  const formula = body.trim()
    .replace(/^(?:计算公式|公式|算式)\s*[:：]\s*/, "")
    .replace(/＋/g, "+").replace(/－/g, "-").replace(/×/g, "*").replace(/÷/g, "/")
    .replace(/（/g, "(").replace(/）/g, ")").trim();
  if (!formula || !completeArithmetic(formula)) {
    return error("无法完整识别算式。请一次粘贴一条公式，移除成绩或说明文字，并检查运算符和括号；也可在高级编辑中逐项填写。");
  }
  const orderMode = orders.has("D") ? "D" : "L";
  return {
    status: "ready",
    draft: {
      name: `${orderMode}序杀特码${header[1] ? `-${header[1]}` : ""}`,
      formula, orderMode, category: "kill_number", normalizer: "subtract_49_to_1_49", target: "special_number",
      verifyMode: "next_special", periodSpan: 1, verifyOffset: 1, positionPattern: [],
      description: `原文：${source}`, sourceFile: "粘贴原文识别", sourceType: "manual",
      enabled: true, participatesInReference: true,
    },
  };
}
