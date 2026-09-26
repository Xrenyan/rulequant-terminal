import { createRuleObservationState, type ObservationEvent, type ObservationSample, type RuleObservationState } from "./rule-observation";

export const RULE_OBSERVATION_STORAGE_KEY = "rulequant:wrong-period-observation:v2";
export const RULE_OBSERVATION_CHANGED_EVENT = "rulequant:wrong-period-observation-changed";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const issue = (value: unknown): value is string => text(value) && /^\d+$/.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const eventTypes = new Set<ObservationEvent["type"]>(["paused", "auto_resumed", "manually_resumed", "observation_finished", "formula_changed", "data_corrected"]);

function sample(value: unknown): value is ObservationSample {
  return object(value) && issue(value.issue) && ["passed", "failed", "unavailable"].includes(String(value.result)) &&
    (value.calculationIssue === undefined || issue(value.calculationIssue)) && (value.output === undefined || text(value.output));
}

export function parseRuleObservationState(raw: string | null): RuleObservationState | null {
  if (!raw) return null;
  try {
    const state: unknown = JSON.parse(raw);
    if (!object(state) || state.version !== 2 || !object(state.settings) || state.settings.periods !== 3 ||
      typeof state.settings.enabled !== "boolean" || typeof state.settings.autoResume !== "boolean" ||
      !(state.activatedIssue === null || issue(state.activatedIssue)) || !(state.lastSeenIssue === null || issue(state.lastSeenIssue)) ||
      (state.activatedAt !== undefined && (!text(state.activatedAt) || !Number.isFinite(Date.parse(state.activatedAt)))) ||
      !object(state.drawFingerprints) || !Object.entries(state.drawFingerprints).every(([key, value]) => issue(key) && text(value)) ||
      !object(state.rules) || !integer(state.sequence) || !integer(state.acknowledgedSequence) || state.acknowledgedSequence > state.sequence ||
      !Array.isArray(state.events) || state.events.length > 500) return null;
    for (const rule of Object.values(state.rules)) {
      if (!object(rule) || !text(rule.signature) || !issue(rule.watchedAfterIssue) || typeof rule.eligible !== "boolean") return null;
      if (rule.pause !== undefined) {
        const pause = rule.pause;
        if (!object(pause) || !text(pause.id) || !issue(pause.causeIssue) || !issue(pause.calculationIssue) || !text(pause.causeOutput) ||
          !text(pause.startedAt) || !["observing", "awaiting_resume"].includes(String(pause.status)) ||
          (pause.causeNeedsReview !== undefined && typeof pause.causeNeedsReview !== "boolean") ||
          !Array.isArray(pause.samples) || pause.samples.length > 3 || !pause.samples.every(sample) ||
          new Set(pause.samples.map((item) => item.issue)).size !== pause.samples.length) return null;
      }
    }
    for (const event of state.events) {
      if (!object(event) || !integer(event.sequence) || event.sequence > state.sequence || !text(event.id) || !eventTypes.has(event.type as ObservationEvent["type"]) ||
        !text(event.ruleId) || !text(event.ruleName) || !issue(event.issue) || !text(event.at) || !text(event.message) ||
        (event.samples !== undefined && (!Array.isArray(event.samples) || !event.samples.every(sample)))) return null;
    }
    return state as RuleObservationState;
  } catch {
    return null;
  }
}

export function readRuleObservationState(storage: StorageLike): { state: RuleObservationState; error: string | null } {
  try {
    const raw = storage.getItem(RULE_OBSERVATION_STORAGE_KEY);
    const state = parseRuleObservationState(raw);
    return { state: state ?? createRuleObservationState(), error: raw && !state ? "原观察记录无法读取，已重新开始记录；旧数据未被用于自动暂停。" : null };
  } catch {
    return { state: createRuleObservationState(), error: "此浏览器无法读取观察记录，刷新后可能无法保留，请检查浏览器的存储权限。" };
  }
}

export function saveRuleObservationState(storage: StorageLike, state: RuleObservationState): string | null {
  try {
    storage.setItem(RULE_OBSERVATION_STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "观察记录暂时无法保存到此浏览器；当前页面仍可使用，请留意刷新后状态可能丢失。";
  }
}
