import { calculateRule } from "@/lib/formula-engine/formula-engine";
import { normalizeDraw } from "@/lib/engine/attributes";
import type { BacktestDetail, RuleBacktestResult, RuleCalculation, RuleQuantConfig, RuleRecord, DrawRecord } from "@/types/domain";

export type FormulaLedgerEntry = {
  currentIssue: string;
  currentNumbersLabel: string;
  formula: string;
  variableLine: string;
  equationLine: string;
  rawResult: number;
  processingLine: string;
  mappingLine: string;
  finalOutputLabel: string;
  nextIssue?: string;
  nextOpenLabel: string;
  statusText: "正确" | "错误" | "待验证";
  statusIcon: "✅" | "❌" | "⏳";
  isFailure: boolean;
  isPending?: boolean;
  compactLine: string;
  detail: BacktestDetail;
};

export type FormulaLedger = {
  summary: {
    ruleId: string;
    ruleName: string;
    category: RuleRecord["category"];
    orderMode: RuleRecord["orderMode"];
    formula: string;
    enabled: boolean;
    total: number;
    success: number;
    failed: number;
    successRate: number;
    last10: boolean[];
    currentStreak: number;
    maxStreak: number;
    failedIssues: string[];
  };
  entries: FormulaLedgerEntry[];
};

export type OneClickFormulaResult = {
  ruleId: string;
  ruleName: string;
  category: RuleRecord["category"];
  orderMode: RuleRecord["orderMode"];
  formula: string;
  variableLine: string;
  equationLine: string;
  rawResult: number;
  mappingLine: string;
  finalOutputLabel: string;
  outputDescription: string;
  process: string[];
  error?: string;
};

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function numbersLabel(numbers: number[]): string {
  if (numbers.length < 7) return numbers.map(padNumber).join(" ");
  return `${numbers.slice(0, 6).map(padNumber).join(" ")} + ${padNumber(numbers[6])}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function variableEntries(variables: Record<string, number>): Array<[string, number]> {
  return Object.entries(variables);
}

function variableLine(variables: Record<string, number>): string {
  const entries = variableEntries(variables);
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(" | ") : "无变量";
}

function equationLine(formula: string, variables: Record<string, number>, rawResult: number): string {
  let expression = formula;
  const entries = variableEntries(variables).sort((a, b) => b[0].length - a[0].length);
  entries.forEach(([key, value]) => {
    expression = expression.replace(new RegExp(escapeRegExp(key), "g"), String(value));
  });
  expression = expression.replace(/\s+/g, " ").trim();
  return `${expression} = ${rawResult}`;
}

function finalOutputLabel(rule: RuleRecord, mappedResult: Array<number | string>): string {
  const value = mappedResult.join("、");
  switch (rule.category) {
    case "kill_zodiac":
      return `杀${value}`;
    case "kill_color":
      return `杀波色${value}`;
    case "include_color":
      return `参考波色${value}`;
    case "kill_parity":
      return `杀${value}`;
    case "include_parity":
      return `参考${value}`;
    case "kill_size":
      return `杀${value}`;
    case "include_size":
      return `参考${value}`;
    case "kill_sum":
      return `杀合${value}`;
    case "kill_tail":
      return `杀尾${value}`;
    case "kill_head":
      return `杀头${value}`;
    case "kill_element":
      return `杀${value}`;
    case "kill_segment":
      return `杀段${value}`;
    case "seven_tail":
      return `七尾 ${value}`;
    case "eight_zodiac":
    case "eight_zodiac_two_period":
      return `八肖 ${value}`;
    case "nine_zodiac":
      return `九肖 ${value}`;
    case "kill_three_as_nine":
      return `九肖 ${value}`;
    default:
      return `输出 ${value}`;
  }
}

function mappingLine(rule: RuleRecord, calculation: Pick<RuleCalculation, "finalResult" | "mappedResult" | "normalizerSteps">): string {
  const mapped = calculation.mappedResult.join("、");
  const finalResult = Array.isArray(calculation.finalResult) ? calculation.finalResult.join("、") : calculation.finalResult;
  switch (rule.category) {
    case "kill_zodiac":
    case "kill_element":
      return `${finalResult} 对应${mapped}`;
    case "kill_color":
    case "include_color":
      return `${finalResult} 对应波色${mapped}`;
    case "kill_parity":
    case "include_parity":
      return `${finalResult} 对应单双${mapped}`;
    case "kill_size":
    case "include_size":
      return `${finalResult} 对应大小${mapped}`;
    case "kill_sum":
      return `${finalResult} 对应合数${mapped}`;
    case "kill_tail":
      return `${finalResult} 对应尾数${mapped}`;
    case "kill_head":
      return `${finalResult} 对应头数${mapped}`;
    case "kill_segment":
      return `${finalResult} 对应段位${mapped}`;
    case "seven_tail":
      return `计算结果：七尾 ${mapped}`;
    case "eight_zodiac":
    case "eight_zodiac_two_period":
      return `计算结果：八肖 ${mapped}`;
    case "nine_zodiac":
      return `计算结果：九肖 ${mapped}`;
    case "kill_three_as_nine":
      return `计算结果：九肖 ${mapped}`;
    default:
      return `计算结果：${mapped}`;
  }
}

function processingLine(detail: Pick<BacktestDetail, "process" | "variables">): string {
  const variableKeys = new Set(Object.keys(detail.variables));
  return detail.process.filter((line) => ![...variableKeys].some((key) => line.startsWith(`${key} =`))).join(" | ");
}

function nextOpenLabel(detail: BacktestDetail): string {
  const next = detail.futureChecks[0];
  if (!next) return "暂无下一期开奖";
  return `${next.issue}期开奖：${next.specialAttributes.zodiac}${padNumber(next.special)}`;
}

function detailToLedgerEntry(rule: RuleRecord, detail: BacktestDetail, isPending = false): FormulaLedgerEntry {
  const variableText = variableLine(detail.variables);
  const equation = equationLine(detail.formula, detail.variables, detail.rawResult);
  const mapping = mappingLine(rule, detail);
  const output = finalOutputLabel(rule, detail.mappedResult);
  const statusText = isPending ? "待验证" : detail.success ? "正确" : "错误";
  const statusIcon = isPending ? "⏳" : detail.success ? "✅" : "❌";
  const nextLabel = isPending ? "待下一期开奖后自动判断正确或错误" : nextOpenLabel(detail);
  return {
    currentIssue: detail.currentIssue,
    currentNumbersLabel: numbersLabel(detail.currentNumbers),
    formula: detail.formula,
    variableLine: variableText,
    equationLine: equation,
    rawResult: detail.rawResult,
    processingLine: processingLine(detail),
    mappingLine: mapping,
    finalOutputLabel: output,
    nextIssue: detail.nextIssue,
    nextOpenLabel: nextLabel,
    statusText,
    statusIcon,
    isFailure: !isPending && !detail.success,
    isPending,
    compactLine: `${detail.currentIssue}期${equation}，${mapping}，本期公式结果：${output}，${nextLabel}，结果：${statusText} ${statusIcon}`,
    detail,
  };
}

function buildPendingLatestDetail(rule: RuleRecord, draws: DrawRecord[], config: RuleQuantConfig, knownIssues: Set<string>): BacktestDetail | undefined {
  const latest = draws.at(-1);
  if (!latest || knownIssues.has(latest.issue)) return undefined;
  const current = normalizeDraw(latest, config);
  const calculation = calculateRule(rule, current, config, { periodIndex: Math.max(draws.length - 1, 0) });
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    currentIssue: current.issue,
    currentNumbers: current.lOrder,
    lOrder: current.lOrder,
    dOrder: current.dOrder,
    formula: calculation.expression,
    variables: calculation.variables,
    expression: calculation.expression,
    process: calculation.process,
    rawResult: calculation.rawResult,
    normalizerSteps: calculation.normalizerSteps,
    finalResult: calculation.finalResult,
    mappedResult: calculation.mappedResult,
    secondaryMappedResult: calculation.secondaryMappedResult,
    targetLabel: finalOutputLabel(rule, calculation.mappedResult),
    futureChecks: [],
    success: true,
  };
}

export function buildFormulaLedger(ruleResult: RuleBacktestResult, options?: { draws: DrawRecord[]; config: RuleQuantConfig }): FormulaLedger {
  const entries = ruleResult.details.map((detail) => detailToLedgerEntry(ruleResult.rule, detail));
  if (options?.draws.length) {
    const pendingDetail = buildPendingLatestDetail(
      ruleResult.rule,
      options.draws,
      options.config,
      new Set(ruleResult.details.map((detail) => detail.currentIssue)),
    );
    if (pendingDetail) entries.push(detailToLedgerEntry(ruleResult.rule, pendingDetail, true));
  }

  return {
    summary: {
      ruleId: ruleResult.rule.id,
      ruleName: ruleResult.rule.name,
      category: ruleResult.rule.category,
      orderMode: ruleResult.rule.orderMode,
      formula: ruleResult.rule.formula,
      enabled: ruleResult.rule.enabled,
      total: ruleResult.total,
      success: ruleResult.success,
      failed: ruleResult.failed,
      successRate: ruleResult.successRate,
      last10: ruleResult.last10,
      currentStreak: ruleResult.currentStreak,
      maxStreak: ruleResult.maxStreak,
      failedIssues: ruleResult.failedIssues,
    },
    entries,
  };
}

export function buildOneClickFormulaResults(input: {
  draw: DrawRecord;
  rules: RuleRecord[];
  config: RuleQuantConfig;
  periodIndex?: number;
}): OneClickFormulaResult[] {
  const normalized = normalizeDraw(input.draw, input.config);
  return input.rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      try {
        const calculation = calculateRule(rule, normalized, input.config, { periodIndex: input.periodIndex });
        const equation = equationLine(calculation.expression, calculation.variables, calculation.rawResult);
        const output = finalOutputLabel(rule, calculation.mappedResult);
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          orderMode: rule.orderMode,
          formula: calculation.expression,
          variableLine: variableLine(calculation.variables),
          equationLine: equation,
          rawResult: calculation.rawResult,
          mappingLine: mappingLine(rule, calculation),
          finalOutputLabel: output,
          outputDescription: output,
          process: calculation.process,
        };
      } catch (error) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          orderMode: rule.orderMode,
          formula: rule.formula,
          variableLine: "-",
          equationLine: "-",
          rawResult: 0,
          mappingLine: "-",
          finalOutputLabel: "计算异常",
          outputDescription: "计算异常",
          process: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}
