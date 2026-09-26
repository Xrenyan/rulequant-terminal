import { normalizeDraw } from "@/lib/engine/attributes";
import { calculateRuleDetail } from "@/lib/formula-engine/formula-engine";
import { canRuleParticipateInReference } from "@/lib/rules/rule-validation";
import type { DrawRecord, NormalizedDraw, RuleQuantConfig, RuleRecord } from "@/types/domain";

export type ObservationSettings = { enabled: boolean; periods: 3; autoResume: boolean };
export type ObservationSample = {
  issue: string;
  calculationIssue?: string;
  result: "passed" | "failed" | "unavailable";
  output?: string;
};
export type RulePause = {
  id: string;
  causeIssue: string;
  calculationIssue: string;
  causeOutput: string;
  startedAt: string;
  samples: ObservationSample[];
  status: "observing" | "awaiting_resume";
  causeNeedsReview?: boolean;
};
export type ObservedRuleState = {
  signature: string;
  watchedAfterIssue: string;
  eligible: boolean;
  pause?: RulePause;
};
export type ObservationEvent = {
  sequence: number;
  id: string;
  type: "paused" | "auto_resumed" | "manually_resumed" | "observation_finished" | "formula_changed" | "data_corrected";
  ruleId: string;
  ruleName: string;
  issue: string;
  at: string;
  message: string;
  samples?: ObservationSample[];
};
export type RuleObservationState = {
  version: 2;
  settings: ObservationSettings;
  activatedIssue: string | null;
  activatedAt?: string;
  lastSeenIssue: string | null;
  drawFingerprints: Record<string, string>;
  rules: Record<string, ObservedRuleState>;
  events: ObservationEvent[];
  sequence: number;
  acknowledgedSequence: number;
};
export type RuleObservationInput = { draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; now?: string };

export function createRuleObservationState(): RuleObservationState {
  return {
    version: 2,
    settings: { enabled: true, periods: 3, autoResume: true },
    activatedIssue: null,
    lastSeenIssue: null,
    drawFingerprints: {},
    rules: {},
    events: [],
    sequence: 0,
    acknowledgedSequence: 0,
  };
}

export function compareDrawIssues(a: string, b: string): number {
  return issueCollator.compare(a, b);
}

const issueCollator = new Intl.Collator("en", { numeric: true });
const observationDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

function localDrawDay(value: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const parts = observationDayFormatter.formatToParts(new Date(timestamp));
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

function predatesActivation(draw: DrawRecord, state: RuleObservationState): boolean {
  if (!draw.date || !state.activatedAt) return false;
  const activationDay = localDrawDay(state.activatedAt);
  const drawDay = localDrawDay(draw.date);
  if (!activationDay || !drawDay) return false;
  // Day-only source data has no trustworthy intraday ordering; its issue watermark decides that case.
  return drawDay < activationDay;
}

function fingerprint(draw: DrawRecord): string {
  return JSON.stringify([draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special, draw.date, draw.year, draw.rawAttributes]);
}

/** Identical duplicates count once; conflicting duplicates and incomplete draws cannot settle a formula. */
export function uniqueCompleteObservationDraws(draws: DrawRecord[]): DrawRecord[] {
  const valid = new Map<string, DrawRecord>();
  const conflicts = new Set<string>();
  for (const draw of draws) {
    if (!/^\d+$/.test(draw.issue)) continue;
    const numbers = [draw.n1, draw.n2, draw.n3, draw.n4, draw.n5, draw.n6, draw.special];
    if (numbers.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 49) || new Set(numbers).size !== 7) continue;
    const previous = valid.get(draw.issue);
    if (previous && fingerprint(previous) !== fingerprint(draw)) conflicts.add(draw.issue);
    else valid.set(draw.issue, draw);
  }
  return [...valid.values()].filter((draw) => !conflicts.has(draw.issue)).sort((a, b) => compareDrawIssues(a.issue, b.issue));
}

function consecutiveIssue(previous: string, next: string): boolean {
  if (previous.length === 7 && next.length === 7) {
    const previousYear = Number(previous.slice(0, 4));
    const nextYear = Number(next.slice(0, 4));
    const previousPeriod = Number(previous.slice(4));
    const nextPeriod = Number(next.slice(4));
    if (nextYear === previousYear) return nextPeriod === previousPeriod + 1;
    const leap = previousYear % 4 === 0 && (previousYear % 100 !== 0 || previousYear % 400 === 0);
    return nextYear === previousYear + 1 && nextPeriod === 1 && previousPeriod === (leap ? 366 : 365);
  }
  return Number(next) === Number(previous) + 1;
}

export function ruleObservationSignature(rule: RuleRecord, config: RuleQuantConfig): string {
  return JSON.stringify([
    rule.category, rule.orderMode, rule.formula, rule.normalizer, rule.target, rule.positionPattern,
    rule.anchorIssue, rule.anchorPatternIndex, rule.periodSpan, rule.verifyOffset, config,
  ]);
}

function appendEvent(
  state: RuleObservationState,
  rule: Pick<RuleRecord, "id" | "name">,
  type: ObservationEvent["type"],
  issue: string,
  at: string,
  message: string,
  samples?: ObservationSample[],
): void {
  state.sequence += 1;
  state.events.push({ sequence: state.sequence, id: `observation-${state.sequence}`, type, ruleId: rule.id, ruleName: rule.name, issue, at, message, samples });
  state.events = state.events.slice(-500);
}

function settledSample(rule: RuleRecord, draws: NormalizedDraw[], index: number, config: RuleQuantConfig): ObservationSample {
  const issue = draws[index].issue;
  const span = Math.max(rule.periodSpan || 1, rule.verifyOffset || 1, rule.category === "eight_zodiac_two_period" ? 2 : 1);
  if (index < span) return { issue, result: "unavailable" };
  const start = index - span;
  // Do not silently use the next available row as the next period when the source has a gap.
  for (let cursor = start + 1; cursor <= index; cursor += 1) {
    if (!consecutiveIssue(draws[cursor - 1].issue, draws[cursor].issue)) return { issue, result: "unavailable" };
  }
  try {
    const detail = calculateRuleDetail({ rule, current: draws[start], futureDraws: draws.slice(start + 1, index + 1), config, periodIndex: start });
    if (detail.futureChecks.length !== span || !Number.isFinite(detail.rawResult)) return { issue, result: "unavailable" };
    return { issue, calculationIssue: detail.currentIssue, result: detail.success ? "passed" : "failed", output: detail.targetLabel };
  } catch {
    return { issue, result: "unavailable" };
  }
}

/** Pure, idempotent reconciliation. Old history establishes a watermark; only later complete draws act. */
export function reconcileRuleObservation(previous: RuleObservationState, input: RuleObservationInput): RuleObservationState {
  const draws = uniqueCompleteObservationDraws(input.draws);
  const latest = draws.at(-1)?.issue ?? previous.lastSeenIssue;
  if (!latest) return previous;
  const now = input.now ?? new Date().toISOString();
  const next: RuleObservationState = {
    ...previous,
    drawFingerprints: { ...previous.drawFingerprints },
    rules: { ...previous.rules },
    events: [...previous.events],
  };
  let changed = false;
  if (!next.activatedIssue) {
    next.activatedIssue = latest;
    next.activatedAt = now;
    next.lastSeenIssue = latest;
    changed = true;
  }
  const activeIds = new Set(input.rules.map((rule) => rule.id));
  for (const id of Object.keys(next.rules)) {
    if (!activeIds.has(id)) { delete next.rules[id]; changed = true; }
  }
  for (const rule of input.rules) {
    const signature = ruleObservationSignature(rule, input.config);
    const eligible = canRuleParticipateInReference(rule);
    const old = next.rules[rule.id];
    if (!old || old.signature !== signature) {
      next.rules[rule.id] = { signature, watchedAfterIssue: latest, eligible };
      if (old?.pause) appendEvent(next, rule, "formula_changed", latest, now, "公式内容已修改，原观察已结束；从现在开始重新记录。");
      changed = true;
    } else if (old.eligible !== eligible) {
      next.rules[rule.id] = { ...old, eligible, watchedAfterIssue: latest };
      changed = true;
    }
  }
  let normalized: NormalizedDraw[] | undefined;
  const drawByIssue = new Map(draws.map((draw) => [draw.issue, draw]));
  const invalidIssues = new Set(input.draws.filter((draw) => previous.drawFingerprints[draw.issue] && !drawByIssue.has(draw.issue)).map((draw) => draw.issue));
  const correctedIssues = new Set(draws.filter((draw) => previous.drawFingerprints[draw.issue] && previous.drawFingerprints[draw.issue] !== fingerprint(draw)).map((draw) => draw.issue));
  for (const issue of invalidIssues) {
    if (previous.drawFingerprints[issue] !== "unavailable") correctedIssues.add(issue);
    if (next.drawFingerprints[issue] !== "unavailable") { next.drawFingerprints[issue] = "unavailable"; changed = true; }
  }
  const hasBackfills = Boolean(previous.lastSeenIssue && draws.some((draw) => !previous.drawFingerprints[draw.issue] && compareDrawIssues(draw.issue, previous.lastSeenIssue!) <= 0));
  // A repaired old draw can update shadow records or complete the three distinct observation draws.
  // It must never become a fresh triggering failure, nor rewrite any previously saved reference.
  if (next.settings.enabled && previous.lastSeenIssue && (correctedIssues.size || hasBackfills)) {
    for (const rule of input.rules) {
      const tracked = next.rules[rule.id];
      const pause = tracked?.pause;
      if (!pause) continue;
      const sampleMap = new Map(pause.samples.filter((sample) => !invalidIssues.has(sample.issue)).map((sample) => [sample.issue, sample]));
      normalized ??= draws.map((item) => normalizeDraw(item, input.config));
      for (let index = 0; index < draws.length; index += 1) {
        if (compareDrawIssues(draws[index].issue, pause.causeIssue) <= 0 || compareDrawIssues(draws[index].issue, previous.lastSeenIssue) > 0 || predatesActivation(draws[index], next)) continue;
        sampleMap.set(draws[index].issue, settledSample(rule, normalized, index, input.config));
      }
      const samples = [...sampleMap.values()].sort((a, b) => compareDrawIssues(a.issue, b.issue)).slice(0, next.settings.periods);
      const affectsCause = [...correctedIssues].some((issue) => compareDrawIssues(issue, pause.calculationIssue) >= 0 && compareDrawIssues(issue, pause.causeIssue) <= 0);
      const affectsSamples = [...correctedIssues].some((issue) => pause.samples.some((sample) => issue === sample.issue || Boolean(sample.calculationIssue && compareDrawIssues(issue, sample.calculationIssue) >= 0 && compareDrawIssues(issue, sample.issue) <= 0)));
      const causeNeedsReview = pause.causeNeedsReview || affectsCause;
      if (affectsCause || affectsSamples) appendEvent(next, rule, "data_corrected", [...correctedIssues].sort(compareDrawIssues).at(-1)!, now,
        affectsCause ? "原错期所用开奖已更正，请重新核对。原暂停记录保留，你可随时恢复；更正不会重复计期。" : "观察期所用开奖已更正，逐期结果已重新核对；同一期不会重复计数。");
      if (samples.length >= next.settings.periods && pause.status !== "awaiting_resume") {
        next.rules[rule.id] = { ...tracked, watchedAfterIssue: previous.lastSeenIssue, pause: next.settings.autoResume ? undefined : { ...pause, samples, causeNeedsReview, status: "awaiting_resume" } };
        appendEvent(next, rule, next.settings.autoResume ? "auto_resumed" : "observation_finished", previous.lastSeenIssue, now,
          next.settings.autoResume ? "缺失记录已补齐，已观察 3 个完整开奖，下一期按原参与设置恢复。" : "缺失记录已补齐，已观察 3 个完整开奖，等待你手动恢复。", samples);
        changed = true;
      } else if (JSON.stringify(samples) !== JSON.stringify(pause.samples) || causeNeedsReview !== pause.causeNeedsReview || affectsCause || affectsSamples) {
        next.rules[rule.id] = { ...tracked, pause: { ...pause, samples, causeNeedsReview, status: samples.length < next.settings.periods ? "observing" : pause.status } };
        changed = true;
      }
    }
  }
  for (let index = 0; index < draws.length; index += 1) {
    const draw = draws[index];
    const key = fingerprint(draw);
    const oldKey = previous.drawFingerprints[draw.issue];
    if (next.drawFingerprints[draw.issue] !== key) { next.drawFingerprints[draw.issue] = key; changed = true; }
    if (oldKey || !next.lastSeenIssue || compareDrawIssues(draw.issue, next.lastSeenIssue) <= 0) continue;
    if (next.settings.enabled && !predatesActivation(draw, next)) {
      normalized ??= draws.map((item) => normalizeDraw(item, input.config));
      for (const rule of input.rules) {
        const tracked = next.rules[rule.id];
        if (!tracked) continue;
        if (tracked.pause) {
          const pause = tracked.pause;
          if (pause.status === "awaiting_resume" || pause.samples.some((sample) => sample.issue === draw.issue)) continue;
          const samples = [...pause.samples, settledSample(rule, normalized, index, input.config)];
          if (samples.length >= next.settings.periods) {
            next.rules[rule.id] = { ...tracked, watchedAfterIssue: draw.issue, pause: next.settings.autoResume ? undefined : { ...pause, samples, status: "awaiting_resume" } };
            appendEvent(next, rule, next.settings.autoResume ? "auto_resumed" : "observation_finished", draw.issue, now,
              next.settings.autoResume ? "已观察 3 期，下一期恢复参与综合参考。" : "已观察 3 期，等待你手动恢复。", samples);
          } else {
            next.rules[rule.id] = { ...tracked, pause: { ...pause, samples } };
          }
          changed = true;
          continue;
        }
        if (!tracked.eligible || compareDrawIssues(draw.issue, tracked.watchedAfterIssue) <= 0) continue;
        const sample = settledSample(rule, normalized, index, input.config);
        if (sample.result !== "failed" || !sample.calculationIssue) continue;
        next.rules[rule.id] = { ...tracked, pause: { id: `${rule.id}:${draw.issue}`, causeIssue: draw.issue, calculationIssue: sample.calculationIssue, causeOutput: sample.output ?? "", startedAt: now, samples: [], status: "observing" } };
        appendEvent(next, rule, "paused", draw.issue, now, `${draw.issue} 期核对未通过，接下来暂停参与综合参考 3 期，继续记录表现。`);
        changed = true;
      }
    }
    next.lastSeenIssue = draw.issue;
    changed = true;
  }
  return changed ? next : previous;
}

export function resumeObservedRule(previous: RuleObservationState, rule: Pick<RuleRecord, "id" | "name">, now = new Date().toISOString()): RuleObservationState {
  const tracked = previous.rules[rule.id];
  if (!tracked?.pause) return previous;
  const issue = previous.lastSeenIssue ?? tracked.pause.causeIssue;
  const next = { ...previous, rules: { ...previous.rules, [rule.id]: { ...tracked, watchedAfterIssue: issue, pause: undefined } }, events: [...previous.events] };
  appendEvent(next, rule, "manually_resumed", issue, now, "你已恢复此公式，从下一期起按原来的参与设置使用。", tracked.pause.samples);
  return next;
}

export function updateObservationSettings(previous: RuleObservationState, patch: Partial<Pick<ObservationSettings, "enabled" | "autoResume">>, now = new Date().toISOString()): RuleObservationState {
  const settings = { ...previous.settings, ...patch };
  if (settings.enabled === previous.settings.enabled && settings.autoResume === previous.settings.autoResume) return previous;
  // Turning the feature back on starts from the last checked draw, never replays old failures.
  const rules = Object.fromEntries(Object.entries(previous.rules).map(([id, rule]) => [id, settings.enabled !== previous.settings.enabled ? { ...rule, watchedAfterIssue: previous.lastSeenIssue ?? rule.watchedAfterIssue, pause: undefined } : rule]));
  const next = { ...previous, settings, rules, events: [...previous.events], activatedAt: settings.enabled && !previous.settings.enabled ? now : previous.activatedAt };
  if (settings.enabled && settings.autoResume && !previous.settings.autoResume) {
    for (const [id, tracked] of Object.entries(next.rules)) {
      if (tracked.pause?.status !== "awaiting_resume") continue;
      const issue = previous.lastSeenIssue ?? tracked.pause.causeIssue;
      const name = [...previous.events].reverse().find((event) => event.ruleId === id)?.ruleName ?? "此公式";
      next.rules[id] = { ...tracked, pause: undefined, watchedAfterIssue: issue };
      appendEvent(next, { id, name }, "auto_resumed", issue, now, "已观察满 3 期；你已开启自动恢复，下一期按原参与设置使用。", tracked.pause.samples);
    }
  }
  return next;
}

export function acknowledgeObservationEvents(previous: RuleObservationState): RuleObservationState {
  return previous.acknowledgedSequence === previous.sequence ? previous : { ...previous, acknowledgedSequence: previous.sequence };
}

export function pausedObservationRuleIds(state: RuleObservationState): Set<string> {
  return new Set(state.settings.enabled ? Object.entries(state.rules).filter(([, rule]) => rule.pause).map(([id]) => id) : []);
}
