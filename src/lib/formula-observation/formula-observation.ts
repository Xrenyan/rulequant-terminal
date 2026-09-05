import { calculateRule, checkRuleSuccess } from "@/lib/formula-engine/formula-engine";
import { normalizeDraw } from "@/lib/engine/attributes";
import type { DrawRecord, RuleCalculation, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type ObservedPrediction = {
  baseIssue: string; capturedAt: string; calculation: RuleCalculation;
  success?: boolean; checkedIssues?: string[]; resolvedAt?: string; specials?: number[];
};
export type FormulaObservationVersion = {
  id: string; ruleId: string; startedAt: string; rule: RuleRecord; config: RuleQuantConfig;
  predictions: ObservedPrediction[]; captureError?: string; latestSeenIssue?: string;
};
export const MAX_OBSERVATION_RECORDS = 2000;
export function formulaObservationVersionKey(rule: RuleRecord, config: RuleQuantConfig): string {
  return JSON.stringify([rule.id, rule.category, rule.orderMode, rule.formula, rule.normalizer, rule.target,
    rule.verifyMode, rule.positionPattern, rule.anchorIssue, rule.anchorPatternIndex, rule.verifyOffset ?? 1, rule.periodSpan, config]);
}
export function sortObservationDraws(draws: DrawRecord[]): DrawRecord[] {
  return [...new Map(draws.map((draw) => [draw.issue, draw])).values()].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
}

function isFollowingIssue(previous: DrawRecord, next: DrawRecord): boolean {
  if (/^\d+$/.test(previous.issue) && /^\d+$/.test(next.issue) && Number(next.issue) === Number(previous.issue) + 1) return true;
  // Annual issue numbers restart at 001. Require the dated year boundary too.
  return /^\d{7}$/.test(previous.issue) && next.issue === `${Number(previous.issue.slice(0, 4)) + 1}001`
    && Boolean(previous.date?.includes("12-31") && next.date?.includes("01-01"));
}

export function updateFormulaObservation(input: {
  previous?: FormulaObservationVersion; rule: RuleRecord; config: RuleQuantConfig;
  draws: DrawRecord[]; now: string; capture: boolean;
}): FormulaObservationVersion {
  const { rule, config, now } = input;
  const id = formulaObservationVersionKey(rule, config);
  if (input.previous && input.previous.id !== id) throw new Error("公式版本不一致，不能合并观察记录。");
  const previous = input.previous ?? { id, ruleId: rule.id, startedAt: now, rule: structuredClone(rule), config: structuredClone(config), predictions: [] };
  const draws = sortObservationDraws(input.draws);
  const indexByIssue = new Map(draws.map((draw, index) => [draw.issue, index]));
  const span = Math.max(rule.periodSpan || 1, rule.verifyOffset || 1, rule.category === "eight_zodiac_two_period" ? 2 : 1);
  let changed = false;
  const predictions = previous.predictions.map((prediction) => {
    if (prediction.success !== undefined) return prediction;
    const index = indexByIssue.get(prediction.baseIssue);
    if (index === undefined) return prediction;
    const future = draws.slice(index + 1, index + span + 1);
    if (future.length < span || future.some((draw, offset) => !isFollowingIssue(offset ? future[offset - 1] : draws[index], draw))) return prediction;
    const checked = rule.category === "eight_zodiac_two_period" ? future : [future[Math.max(rule.verifyOffset ?? 1, 1) - 1]];
    const success = checked.every((draw) => checkRuleSuccess(rule, prediction.calculation, normalizeDraw(draw, config)));
    changed = true;
    return { ...prediction, success, checkedIssues: checked.map((draw) => draw.issue), specials: checked.map((draw) => draw.special), resolvedAt: now };
  });
  let captureError = previous.captureError;
  const latest = draws.at(-1);
  const newestRecorded = predictions.reduce((newest, item) => item.baseIssue.localeCompare(newest, "zh-CN", { numeric: true }) > 0 ? item.baseIssue : newest, "");
  const lastSeen = previous.latestSeenIssue ?? newestRecorded;
  const latestSeenIssue = latest && latest.issue.localeCompare(lastSeen, "zh-CN", { numeric: true }) > 0 ? latest.issue : lastSeen;
  changed = changed || latestSeenIssue !== previous.latestSeenIssue;
  const shouldCapture = input.capture && rule.enabled && latest && latest.issue.localeCompare(lastSeen, "zh-CN", { numeric: true }) >= 0 && latest.issue.localeCompare(newestRecorded, "zh-CN", { numeric: true }) > 0;
  const drawTime = latest?.date ? Date.parse(latest.date) : Number.NaN;
  const elapsed = Date.parse(now) - drawTime;
  if (shouldCapture && (!Number.isFinite(elapsed) || elapsed > 36 * 60 * 60 * 1000 || elapsed < -24 * 60 * 60 * 1000)) {
    captureError = "开奖日期缺失或不是最近记录，暂不开始新观察。请先确认最新开奖，避免把旧期结果当成提前记录。";
    changed = changed || captureError !== previous.captureError;
  } else if (shouldCapture && predictions.length >= MAX_OBSERVATION_RECORDS) {
    captureError = `此版本已保存${MAX_OBSERVATION_RECORDS}期，已暂停新增记录，原记录仍可查看。`;
    changed = changed || captureError !== previous.captureError;
  } else if (shouldCapture) {
    try {
      const calculation = calculateRule(rule, normalizeDraw(latest, config), config, { periodIndex: draws.length - 1 });
      // Freeze outputs now. Resolution later uses only these outputs and this stored version.
      predictions.push({ baseIssue: latest.issue, capturedAt: now, calculation: { ...structuredClone(calculation), process: [] } });
      captureError = undefined; changed = true;
    } catch { captureError = "这条公式本次没有算出结果，本期未加入观察。"; changed = changed || captureError !== previous.captureError; }
  }
  return changed ? { ...previous, predictions, captureError, latestSeenIssue } : previous;
}
