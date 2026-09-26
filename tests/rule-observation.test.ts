import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/config/default-config";
import { seedRules } from "@/lib/data/seed";
import type { DrawRecord, RuleRecord } from "@/types/domain";
import { acknowledgeObservationEvents, createRuleObservationState, pausedObservationRuleIds, reconcileRuleObservation, resumeObservedRule, uniqueCompleteObservationDraws, updateObservationSettings, type RuleObservationState } from "@/lib/rule-observation/rule-observation";
import { parseRuleObservationState, readRuleObservationState, saveRuleObservationState } from "@/lib/rule-observation/observation-storage";
import { isRuleObservationReady } from "@/lib/rule-observation/use-rule-observation";

const rule: RuleRecord = { ...seedRules.find((item) => item.category === "kill_number")!, id: "observation-test", name: "杀49测试", formula: "49", periodSpan: 1, verifyOffset: 1, enabled: true, participatesInReference: true };
const draw = (issue: string | number, special = 49): DrawRecord => ({ issue: String(issue).length < 7 ? `2026${String(issue).padStart(3, "0")}` : String(issue), n1: 1, n2: 2, n3: 3, n4: 4, n5: 5, n6: 6, special });
const update = (state: RuleObservationState, draws: DrawRecord[], rules = [rule]) => reconcileRuleObservation(state, { draws, rules, config: defaultConfig, now: "2026-09-26T10:00:00.000Z" });
const activate = (draws = [draw(267)], rules = [rule]) => update(createRuleObservationState(), draws, rules);

describe("错期暂停观察：按新开奖自动管理，不篡改历史", () => {
  it("首次以最新期为起点，不因旧历史出错批量暂停", () => {
    const state = activate([draw(265), draw(266), draw(267)]);
    expect(state.activatedIssue).toBe("2026267");
    expect(pausedObservationRuleIds(state).size).toBe(0);
    expect(state.events).toEqual([]);
  });
  it("首次用旧快照离线登记后，补入早于启用日的历史不会批量暂停", () => {
    const baseline = { ...draw(212), date: "2026-08-01" };
    const historical = [{ ...draw(267), date: "2026-09-24" }, { ...draw(268), date: "2026-09-25" }];
    let state = activate([baseline]);
    state = update(state, [baseline, ...historical]);
    expect(state.rules[rule.id].pause).toBeUndefined();
    expect(state.events).toHaveLength(0);
    expect(state.lastSeenIssue).toBe("2026268");
    state = update(state, [baseline, ...historical, { ...draw(269), date: "2026-09-26" }]);
    expect(state.rules[rule.id].pause?.causeIssue).toBe("2026269");
  });
  it("启用时间按澳门日期判断，UTC前一天晚上是当地同一天", () => {
    const baseline = { ...draw(267), date: "2026-09-25" };
    const state = reconcileRuleObservation(createRuleObservationState(), { draws: [baseline], rules: [rule], config: defaultConfig, now: "2026-09-25T18:00:00Z" });
    const next = update(state, [baseline, { ...draw(268), date: "2026-09-26" }]);
    expect(next.rules[rule.id].pause?.causeIssue).toBe("2026268");
  });
  it("268确认错，269至271只观察，272恢复；观察期错误不续期", () => {
    let state = activate();
    state = update(state, [draw(267), draw(268)]);
    expect(state.rules[rule.id].pause?.causeIssue).toBe("2026268");
    expect(state.rules[rule.id].pause?.calculationIssue).toBe("2026267");
    state = update(state, [draw(267), draw(268), draw(269), draw(270)]);
    expect(state.rules[rule.id].pause?.samples.map((sample) => sample.issue)).toEqual(["2026269", "2026270"]);
    expect(state.events.filter((event) => event.type === "paused")).toHaveLength(1);
    state = update(state, [draw(267), draw(268), draw(269), draw(270), draw(271)]);
    expect(pausedObservationRuleIds(state).size).toBe(0);
    expect(state.events.at(-1)?.type).toBe("auto_resumed");
    expect(state.events.at(-1)?.samples?.map((sample) => sample.result)).toEqual(["failed", "failed", "failed"]);
    state = update(state, [draw(267), draw(268), draw(269), draw(270), draw(271), draw(272)]);
    expect(state.rules[rule.id].pause?.causeIssue).toBe("2026272");
  });
  it("重复刷新不改变状态对象，不重复计期或记录提醒", () => {
    const draws = [draw(267), draw(268), draw(269)];
    const state = update(activate(), draws);
    expect(update(state, draws)).toBe(state);
    expect(update(state, [...draws, draw(269)])).toBe(state);
    expect(state.rules[rule.id].pause?.samples).toHaveLength(1);
  });
  it("提前恢复不被同一错期再次暂停，新错期才重新开始", () => {
    const draws = [draw(267), draw(268), draw(269)];
    let state = update(activate(), draws);
    state = resumeObservedRule(state, rule, "2026-09-26T11:00:00Z");
    expect(state.rules[rule.id].pause).toBeUndefined();
    expect(update(state, draws)).toBe(state);
    state = update(state, [...draws, draw(270)]);
    expect(state.rules[rule.id].pause?.causeIssue).toBe("2026270");
    expect(state.events.map((event) => event.type)).toEqual(["paused", "manually_resumed", "paused"]);
  });
  it("关闭自动恢复后满三期等待用户，更多开奖不会延长倒计时", () => {
    let state = updateObservationSettings(activate(), { autoResume: false });
    state = update(state, [draw(267), draw(268), draw(269), draw(270), draw(271), draw(272)]);
    expect(state.rules[rule.id].pause?.status).toBe("awaiting_resume");
    expect(state.rules[rule.id].pause?.samples).toHaveLength(3);
    expect(state.events.at(-1)?.type).toBe("observation_finished");
    state = updateObservationSettings(state, { autoResume: true });
    expect(state.rules[rule.id].pause).toBeUndefined();
    expect(state.events.at(-1)?.type).toBe("auto_resumed");
  });
  it.each([{ enabled: false }, { participatesInReference: false }, { sourceType: "example" as const }])("不管理手动停用、排除和示例：%j", (patch) => {
    const excluded = { ...rule, ...patch };
    const state = update(activate([draw(267)], [excluded]), [draw(267), draw(268)], [excluded]);
    expect(state.rules[rule.id].pause).toBeUndefined();
    expect(excluded).toMatchObject(patch);
  });
  it("观察结束和提前恢复不会启用手动停用公式", () => {
    let state = update(activate(), [draw(267), draw(268)]);
    const disabled = { ...rule, enabled: false };
    state = update(state, [draw(267), draw(268), draw(269), draw(270), draw(271)], [disabled]);
    expect(state.rules[rule.id].pause).toBeUndefined();
    expect(state.rules[rule.id].eligible).toBe(false);
    expect(disabled.enabled).toBe(false);
  });
  it("重新加入和新公式只从现在开始，不追究补来的旧错期", () => {
    const excluded = { ...rule, participatesInReference: false };
    const state = update(activate([draw(267)], [excluded]), [draw(267), draw(268)], [rule]);
    expect(state.rules[rule.id].pause).toBeUndefined();
    const next = update(state, [draw(267), draw(268), draw(269)]);
    expect(next.rules[rule.id].pause?.causeIssue).toBe("2026269");
  });
  it("修改公式重新登记版本，单纯改名称不重置观察", () => {
    const state = update(activate(), [draw(267), draw(268)]);
    const renamed = update(state, [draw(267), draw(268)], [{ ...rule, name: "新名字" }]);
    expect(renamed).toBe(state);
    const edited = update(state, [draw(267), draw(268)], [{ ...rule, formula: "48" }]);
    expect(edited.rules[rule.id].pause).toBeUndefined();
    expect(edited.events.at(-1)?.type).toBe("formula_changed");
  });
  it("删除公式移除当前观察但保留曾经的变化记录", () => {
    const state = update(activate(), [draw(267), draw(268)]);
    const next = update(state, [draw(267), draw(268)], []);
    expect(next.rules[rule.id]).toBeUndefined();
    expect(next.events).toHaveLength(1);
  });
  it("错误公式和未开奖不会被误判为错期", () => {
    const invalid = { ...rule, formula: "未知变量+1" };
    const state = update(activate([draw(267)], [invalid]), [draw(267), draw(268)], [invalid]);
    expect(state.rules[rule.id].pause).toBeUndefined();
    expect(update(activate(), [draw(267), { ...draw(268), special: 0 }]).events).toHaveLength(0);
  });
  it("多期公式等整个核对窗口结束后，才可能暂停", () => {
    const multi = { ...rule, periodSpan: 2, verifyOffset: 2 };
    let state = activate([draw(267)], [multi]);
    state = update(state, [draw(267), draw(268)], [multi]);
    expect(state.rules[rule.id].pause).toBeUndefined();
    state = update(state, [draw(267), draw(268), draw(269)], [multi]);
    expect(state.rules[rule.id].pause?.causeIssue).toBe("2026269");
    expect(state.rules[rule.id].pause?.calculationIssue).toBe("2026267");
  });
  it("缺失期不被假装成下一期，冲突重复数据也不触发错误", () => {
    const gap = update(activate(), [draw(267), draw(269)]);
    expect(gap.rules[rule.id].pause).toBeUndefined();
    const conflict = update(activate(), [draw(267), draw(268), draw(268, 48)]);
    expect(conflict.rules[rule.id].pause).toBeUndefined();
    expect(conflict.lastSeenIssue).toBe("2026267");
  });
  it("暂停只按完整实际开奖计数；缺失期补齐后计入，不重复算", () => {
    let state = update(activate(), [draw(267), draw(268), draw(270)]);
    expect(state.rules[rule.id].pause?.samples.map((sample) => sample.issue)).toEqual(["2026270"]);
    expect(state.rules[rule.id].pause?.samples[0].result).toBe("unavailable");
    state = update(state, [draw(267), draw(268), draw(269), draw(270)]);
    expect(state.rules[rule.id].pause?.samples.map((sample) => sample.issue)).toEqual(["2026269", "2026270"]);
    state = update(state, [draw(267), draw(268), draw(269), draw(270), draw(271)]);
    expect(state.rules[rule.id].pause).toBeUndefined();
  });
  it("更正旧开奖不会重复暂停或计期，会提示核对原错期", () => {
    const original = [draw(267), draw(268), draw(269)];
    const state = update(activate(), original);
    const corrected = update(state, [draw(267), draw(268, 48), draw(269)]);
    expect(corrected.rules[rule.id].pause?.samples).toHaveLength(1);
    expect(corrected.rules[rule.id].pause?.causeNeedsReview).toBe(true);
    expect(corrected.events.map((event) => event.type)).toEqual(["paused", "data_corrected"]);
    expect(update(corrected, [draw(267), draw(268, 48), draw(269)])).toBe(corrected);
  });
  it("多期核对的中间开奖更正也会标记原错期需要复核", () => {
    const multi = { ...rule, periodSpan: 3, verifyOffset: 3 };
    const state = update(activate([draw(267)], [multi]), [draw(267), draw(268), draw(269), draw(270)], [multi]);
    expect(state.rules[rule.id].pause?.causeIssue).toBe("2026270");
    const corrected = update(state, [draw(267), draw(268, 48), draw(269), draw(270)], [multi]);
    expect(corrected.rules[rule.id].pause?.causeNeedsReview).toBe(true);
    expect(corrected.events.at(-1)?.type).toBe("data_corrected");
  });
  it("观察期存在冲突数据先移除不可信计期，修复后只计入一次", () => {
    const state = update(activate(), [draw(267), draw(268), draw(269)]);
    const conflict = [draw(267), draw(268), draw(269), draw(269, 48)];
    const corrected = update(state, conflict);
    expect(corrected.rules[rule.id].pause?.samples).toHaveLength(0);
    expect(update(corrected, conflict)).toBe(corrected);
    const restored = update(corrected, [draw(267), draw(268), draw(269, 48)]);
    expect(restored.rules[rule.id].pause?.samples).toEqual([expect.objectContaining({ issue: "2026269", result: "passed" })]);
  });
  it("补齐缺失期使观察达到三个真实开奖时即可结束，不等待额外一期", () => {
    const state = update(activate(), [draw(267), draw(268), draw(270), draw(271)]);
    expect(state.rules[rule.id].pause?.samples).toHaveLength(2);
    const restored = update(state, [draw(267), draw(268), draw(269), draw(270), draw(271)]);
    expect(restored.rules[rule.id].pause).toBeUndefined();
    expect(restored.events.at(-1)?.samples?.map((sample) => sample.issue)).toEqual(["2026269", "2026270", "2026271"]);
    expect(restored.events.at(-1)?.type).toBe("auto_resumed");
  });
  it("跨年按真实开奖继续观察而不是期号加三", () => {
    let state = activate([draw("2026364")]);
    state = update(state, [draw("2026364"), draw("2026365"), draw("2027001"), draw("2027002")]);
    expect(state.rules[rule.id].pause?.samples.map((sample) => sample.issue)).toEqual(["2027001", "2027002"]);
    state = update(state, [draw("2026364"), draw("2026365"), draw("2027001"), draw("2027002"), draw("2027003")]);
    expect(state.rules[rule.id].pause).toBeUndefined();
  });
  it("关闭再开启不会回放同一批旧错误", () => {
    let state = update(activate(), [draw(267), draw(268)]);
    state = updateObservationSettings(state, { enabled: false });
    expect(pausedObservationRuleIds(state).size).toBe(0);
    state = update(state, [draw(267), draw(268), draw(269)]);
    state = updateObservationSettings(state, { enabled: true });
    expect(update(state, [draw(267), draw(268), draw(269)])).toBe(state);
    expect(state.rules[rule.id].pause).toBeUndefined();
  });
  it("不修改输入规则或旧状态，已读提醒不会重复出现", () => {
    const before = activate();
    const original = JSON.stringify(before);
    const state = update(before, [draw(267), draw(268)]);
    expect(JSON.stringify(before)).toBe(original);
    expect(rule.enabled).toBe(true);
    expect(rule.participatesInReference).toBe(true);
    const acknowledged = acknowledgeObservationEvents(state);
    expect(acknowledged.acknowledgedSequence).toBe(state.sequence);
    expect(acknowledgeObservationEvents(acknowledged)).toBe(acknowledged);
  });
  it("只接受七个不同的1至49整数；同期开奖去重后按期号排序", () => {
    expect(uniqueCompleteObservationDraws([draw(269), draw(268), draw(268), { ...draw(270), special: 1 }, { ...draw(271), n1: 1.2 }]).map((item) => item.issue)).toEqual(["2026268", "2026269"]);
  });
});

describe("错期观察的浏览器本地记录", () => {
  it("首次启用等待数据基线检查；已有观察水位时不阻塞后台刷新", () => {
    expect(isRuleObservationReady(false, true, "2026268", false)).toBe(false);
    expect(isRuleObservationReady(true, false, "2026268", false)).toBe(false);
    expect(isRuleObservationReady(true, true, null, false)).toBe(false);
    expect(isRuleObservationReady(true, true, null, true)).toBe(true);
    expect(isRuleObservationReady(true, true, "2026268", false)).toBe(true);
  });
  it("保存再读取保留已观察进度和早恢复去重水位", () => {
    let state = update(activate(), [draw(267), draw(268), draw(269)]);
    let raw: string | null = null;
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    expect(saveRuleObservationState(storage, state)).toBeNull();
    expect(readRuleObservationState(storage).state).toEqual(state);
    state = resumeObservedRule(state, rule);
    saveRuleObservationState(storage, state);
    expect(update(readRuleObservationState(storage).state, [draw(267), draw(268), draw(269)])).toEqual(state);
  });
  it("拒绝损坏或伪造状态，并让界面显示存储失败而不是静默丢失", () => {
    expect(parseRuleObservationState("bad json")).toBeNull();
    expect(parseRuleObservationState(JSON.stringify({ ...activate(), version: 1 }))).toBeNull();
    expect(parseRuleObservationState(JSON.stringify({ ...activate(), settings: { enabled: true, autoResume: true, periods: 0 } }))).toBeNull();
    expect(readRuleObservationState({ getItem: () => "bad", setItem: () => undefined }).error).toBeTruthy();
    const unavailable = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(readRuleObservationState(unavailable).error).toBeTruthy();
    expect(saveRuleObservationState(unavailable, activate())).toBeTruthy();
  });
});
