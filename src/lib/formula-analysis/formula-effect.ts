import { normalizeDraw } from "@/lib/engine/attributes";
import { checkRuleSuccess } from "@/lib/formula-engine/formula-engine";
import { normalizeFormulaAnalysisWindow } from "@/lib/formula-analysis/windows";
import type { BacktestDetail, DrawRecord, NumberAttributes, RuleQuantConfig, RuleRecord } from "@/types/domain";

const TARGET_ATTRIBUTE: Record<RuleRecord["category"], keyof NumberAttributes> = {
  kill_zodiac: "zodiac", include_zodiac: "zodiac", six_zodiac: "zodiac", eight_zodiac: "zodiac", eight_zodiac_two_period: "zodiac", nine_zodiac: "zodiac", kill_three_as_nine: "zodiac",
  kill_color: "color", include_color: "color", kill_parity: "parity", include_parity: "parity", kill_size: "size", include_size: "size",
  kill_sum: "sum", kill_tail: "tail", seven_tail: "tail", kill_head: "head", kill_half_head: "number", kill_half_color: "number", kill_door: "number", kill_element: "element", kill_segment: "segment", custom_set: "number",
};

export type FormulaEffect = {
  status: "available" | "unavailable" | "no-samples";
  sampleCount: number;
  skippedCount: number;
  successes: number;
  actualRate: number | null;
  expectedRate: number | null;
  differencePoints: number | null;
  /** Descriptive Wilson interval; overlapping verification periods are not independent. */
  actualInterval: [number, number] | null;
  successLabel: string;
  interpretation: string;
  reason?: string;
  failureIssues: string[];
};

function validDraw(draw: DrawRecord | undefined): draw is DrawRecord {
  if (!draw) return false;
  const numbers = [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
  return numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 49)
    && new Set(numbers).size === 7;
}

function interval(successes: number, count: number): [number, number] | null {
  if (!count) return null;
  const p = successes / count;
  const z2 = 1.96 ** 2;
  const center = (p + z2 / (2 * count)) / (1 + z2 / count);
  const margin = 1.96 * Math.sqrt(p * (1 - p) / count + z2 / (4 * count ** 2)) / (1 + z2 / count);
  return [100 * (center - margin), 100 * (center + margin)];
}

/** Reuses calculated details: never runs formulas or a backtest. Rates are percentages. */
export function evaluateFormulaEffect(input: {
  rule: RuleRecord;
  details: BacktestDetail[];
  config: RuleQuantConfig;
  draws: DrawRecord[];
  window?: number;
  error?: string;
}): FormulaEffect {
  const { rule, config } = input;
  const span = Math.max(rule.periodSpan || 1, rule.verifyOffset || 1, rule.category === "eight_zodiac_two_period" ? 2 : 1);
  const offset = Math.max(rule.verifyOffset ?? 1, 1) - 1;
  const allPeriods = rule.category === "eight_zodiac_two_period";
  const draws = new Map<string, DrawRecord>();
  const duplicateIssues = new Set<string>();
  for (const draw of input.draws) {
    if (draws.has(draw.issue)) duplicateIssues.add(draw.issue);
    draws.set(draw.issue, draw);
  }
  const selected = input.details.slice(-normalizeFormulaAnalysisWindow(input.window));
  const seen = new Set<string>();
  const valid = selected.filter((detail) => {
    if (detail.ruleId !== rule.id || seen.has(detail.currentIssue)) return false;
    seen.add(detail.currentIssue);
    if (!validDraw(draws.get(detail.currentIssue)) || duplicateIssues.has(detail.currentIssue)) return false;
    if (!Number.isInteger(span) || !Number.isInteger(offset) || detail.futureChecks.length !== span) return false;
    const checks = allPeriods ? detail.futureChecks : [detail.futureChecks[offset]];
    return checks.every((check) => check && validDraw(draws.get(check.issue))
      && !duplicateIssues.has(check.issue) && draws.get(check.issue)?.special === check.special)
      && detail.success === (allPeriods ? checks.every((check) => check.success) : checks[0].success);
  });
  const successes = valid.filter((detail) => detail.success).length;
  const actualRate = valid.length ? 100 * successes / valid.length : null;
  const base: FormulaEffect = {
    status: "unavailable", sampleCount: valid.length, skippedCount: selected.length - valid.length,
    successes, actualRate, expectedRate: null, differencePoints: null, actualInterval: interval(successes, valid.length),
    successLabel: rule.category.startsWith("kill_") && rule.category !== "kill_three_as_nine" ? "排除正确" : "选中",
    interpretation: "", failureIssues: valid.filter((detail) => !detail.success).map((detail) => detail.currentIssue).reverse(),
  };
  const unavailable = (reason: string): FormulaEffect => ({ ...base, reason, interpretation: `${reason}；只显示历史实际结果，不推算随机参考。` });
  if (input.error) return unavailable("公式计算有误，需要先检查公式");
  if (!TARGET_ATTRIBUTE[rule.category] || rule.verifyMode !== "next_special" || !/^(next_special|special(?:_(zodiac|sum|tail|head|segment|parity|size|color|element|number|half_head|half_color|door))?)$/.test(rule.target)) {
    return unavailable("此公式的验证目标暂不支持同条件比较");
  }
  if (!valid.length) return { ...base, status: "no-samples", interpretation: "还没有可完整核对的期次，暂时无法判断表现。" };
  try {
    // The engine's own membership check handles every category and deduplicates coverage naturally.
    const uniformDraws = Array.from({ length: 49 }, (_, index) => normalizeDraw({ issue: "reference", n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special: index + 1 }, config));
    const attribute = TARGET_ATTRIBUTE[rule.category];
    const domain = new Set(uniformDraws.map((draw) => draw.specialAttributes[attribute]));
    let expected = 0;
    for (const detail of valid) {
      if (!detail.mappedResult.length || detail.mappedResult.some((value) => !domain.has(value))) return unavailable("公式结果包含无法对应号码的值");
      const checks = allPeriods ? detail.futureChecks : [detail.futureChecks[offset]];
      for (const check of checks) {
        const mapped = uniformDraws[check.special - 1].specialAttributes;
        // Historical source overrides cannot establish a complete 49-number table for that issue.
        if (mapped[attribute] !== check.specialAttributes[attribute]) {
          return unavailable("历史开奖属性与当前号码表不同，缺少当期完整号码表");
        }
      }
      const probability = uniformDraws.filter((draw) => checkRuleSuccess(rule, detail, draw)).length / 49;
      expected += allPeriods ? probability ** checks.length : probability;
    }
    const expectedRate = expected / valid.length * 100;
    const differencePoints = actualRate! - expectedRate;
    return {
      ...base, status: "available", expectedRate, differencePoints,
      interpretation: `${valid.length < 30 ? "已统计期数较少，差异容易受偶然结果影响。" : "这只是已统计期间的历史差异。"}实际比同条件随机参考${differencePoints >= 0 ? "高" : "低"}${Math.abs(differencePoints).toFixed(1)}个百分点，不能证明未来更好。${allPeriods ? "本规则要求验证的每一期都选中；相邻记录可能共用开奖，不能视为独立重复验证。" : `按第${offset + 1}期的实际验证目标比较。`}`,
    };
  } catch {
    return unavailable("号码映射不完整，暂时无法建立同条件参考");
  }
}
