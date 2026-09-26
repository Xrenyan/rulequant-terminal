import type { BacktestDetail, BacktestResult, NumberAttributes, RuleBacktestResult } from "@/types/domain";

type CompactHistoryRow = [
  string, number, number, number, number, BacktestDetail["finalResult"], BacktestDetail["mappedResult"],
  BacktestDetail["secondaryMappedResult"] | null, string | null, number, number,
  Array<[string, number, number, boolean]>, boolean,
];
type PackedRuleResult = Omit<RuleBacktestResult, "details"> & { details?: BacktestDetail[]; history?: CompactHistoryRow[] };
export type BacktestTransport = {
  generatedAt: string;
  ruleResults: PackedRuleResult[];
  numbers: number[][];
  attributes: NumberAttributes[];
};

/** Transfer the histories needed for trends without duplicating the full calculation transcript. */
export function packBacktest(backtest: BacktestResult, detailRuleIds: string[] = [], fullDetails = false): BacktestTransport {
  const requested = new Set(detailRuleIds);
  const numbers: number[][] = [];
  const attributes: NumberAttributes[] = [];
  const numberIndex = new WeakMap<number[], number>();
  const attributeIndex = new WeakMap<NumberAttributes, number>();
  const indexNumbers = (values: number[] | undefined) => {
    if (!values) return -1;
    const existing = numberIndex.get(values);
    if (existing !== undefined) return existing;
    const index = numbers.push(values) - 1;
    numberIndex.set(values, index);
    return index;
  };
  const indexAttribute = (value: NumberAttributes | undefined) => {
    if (!value) return -1;
    const existing = attributeIndex.get(value);
    if (existing !== undefined) return existing;
    const index = attributes.push(value) - 1;
    attributeIndex.set(value, index);
    return index;
  };
  return {
    generatedAt: backtest.generatedAt, numbers, attributes,
    ruleResults: backtest.ruleResults.map(({ details, ...result }) => {
      if (fullDetails || requested.has(result.rule.id)) return { ...result, details };
      return { ...result, history: details.map((detail): CompactHistoryRow => [
        detail.currentIssue, indexNumbers(detail.currentNumbers), indexNumbers(detail.lOrder), indexNumbers(detail.dOrder),
        detail.rawResult, detail.finalResult, detail.mappedResult, detail.secondaryMappedResult ?? null,
        detail.nextIssue ?? null, indexNumbers(detail.nextNumbers), indexAttribute(detail.nextSpecialAttributes),
        detail.futureChecks.map((check) => [check.issue, check.special, indexAttribute(check.specialAttributes), check.success]),
        detail.success,
      ]) };
    }),
  };
}

/** Complete traces remain in the worker; callers request them explicitly before displaying/exporting. */
export function unpackBacktest(packet: BacktestTransport): BacktestResult {
  return {
    generatedAt: packet.generatedAt,
    ruleResults: packet.ruleResults.map(({ history, details, ...result }) => ({
      ...result,
      details: details ?? (history ?? []).map((row): BacktestDetail => ({
        ruleId: result.rule.id, ruleName: result.rule.name, currentIssue: row[0],
        currentNumbers: packet.numbers[row[1]], lOrder: packet.numbers[row[2]], dOrder: packet.numbers[row[3]],
        formula: result.rule.formula, variables: {}, expression: "", process: [], normalizerSteps: [], targetLabel: "",
        rawResult: row[4], finalResult: row[5], mappedResult: row[6], secondaryMappedResult: row[7] ?? undefined,
        nextIssue: row[8] ?? undefined, nextNumbers: row[9] < 0 ? undefined : packet.numbers[row[9]],
        nextSpecialAttributes: row[10] < 0 ? undefined : packet.attributes[row[10]],
        futureChecks: row[11].map(([issue, special, attribute, success]) => ({ issue, special, specialAttributes: packet.attributes[attribute], success })),
        success: row[12],
      })),
    })),
  };
}
