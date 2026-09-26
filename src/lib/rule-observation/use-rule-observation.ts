"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrawRecord, RuleQuantConfig, RuleRecord } from "@/types/domain";
import {
  acknowledgeObservationEvents, createRuleObservationState, pausedObservationRuleIds, reconcileRuleObservation,
  resumeObservedRule, updateObservationSettings, type ObservationSettings, type RuleObservationState,
} from "./rule-observation";
import { readRuleObservationState, RULE_OBSERVATION_STORAGE_KEY, saveRuleObservationState } from "./observation-storage";

type Input = { draws: DrawRecord[]; rules: RuleRecord[]; config: RuleQuantConfig; ready: boolean; activationReady?: boolean };

export function isRuleObservationReady(loaded: boolean, inputReady: boolean, activatedIssue: string | null, activationReady = true): boolean {
  return loaded && inputReady && (Boolean(activatedIssue) || activationReady);
}

/** Browser-local automatic management. It never edits a formula or any saved historical reference. */
export function useRuleObservation(input: Input) {
  const [stored, setStored] = useState<RuleObservationState>(createRuleObservationState);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const { draws, rules, config, ready: inputReady, activationReady = true } = input;
  const ready = isRuleObservationReady(loaded, inputReady, stored.activatedIssue, activationReady);
  useEffect(() => {
    const load = () => {
      window.clearTimeout(saveTimer.current);
      try {
        const result = readRuleObservationState(window.localStorage);
        setStored(result.state);
        setStorageError(result.error);
      } catch {
        setStorageError("此浏览器无法读取观察记录，刷新后可能无法保留，请检查浏览器的存储权限。");
      }
      setLoaded(true);
    };
    const timer = window.setTimeout(load, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === RULE_OBSERVATION_STORAGE_KEY) load(); };
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); };
  }, []);
  const state = useMemo(() => ready ? reconcileRuleObservation(stored, { draws, rules, config }) : stored,
    [ready, stored, draws, rules, config]);
  // Reconcile before returning participation state; a newly failed rule cannot slip into one render's reference.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      let error: string | null = null;
      try { error = saveRuleObservationState(window.localStorage, state); }
      catch { error = "观察记录暂时无法保存到此浏览器；刷新后状态可能丢失。"; }
      if (error) setStorageError(error);
      setStored((previous) => previous === stored ? state : previous);
    }, 0);
    saveTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [ready, state, stored]);
  const commit = useCallback((transform: (state: RuleObservationState) => RuleObservationState) => {
    const next = transform(state);
    if (next === state) return;
    // An older delayed reconciliation must not overwrite a just-clicked manual restore.
    window.clearTimeout(saveTimer.current);
    let error: string | null = null;
    try { error = saveRuleObservationState(window.localStorage, next); }
    catch { error = "观察记录暂时无法保存到此浏览器；刷新后状态可能丢失。"; }
    if (error) setStorageError(error);
    setStored(next);
  }, [state]);
  const setSettings = useCallback((patch: Partial<Pick<ObservationSettings, "enabled" | "autoResume">>) => commit((previous) => updateObservationSettings(previous, patch)), [commit]);
  const resumeRule = useCallback((ruleId: string) => {
    const rule = rules.find((item) => item.id === ruleId);
    if (rule) commit((previous) => resumeObservedRule(previous, rule));
  }, [rules, commit]);
  const acknowledgeEvents = useCallback(() => commit(acknowledgeObservationEvents), [commit]);
  const pausedRuleIds = useMemo(() => pausedObservationRuleIds(state), [state]);
  const pausedRules = useMemo(() => rules.flatMap((rule) => {
    const pause = state.settings.enabled ? state.rules[rule.id]?.pause : undefined;
    return pause ? [{ rule, pause, remaining: Math.max(0, state.settings.periods - pause.samples.length) }] : [];
  }), [rules, state]);
  const unreadEvents = useMemo(() => state.events.filter((event) => event.sequence > state.acknowledgedSequence), [state]);
  return { state, settings: state.settings, ready, storageError, pausedRuleIds, pausedRules, unreadEvents,
    setSettings, setEnabled: (enabled: boolean) => setSettings({ enabled }), setAutoResume: (autoResume: boolean) => setSettings({ autoResume }), resumeRule, acknowledgeEvents };
}

export type RuleObservationController = ReturnType<typeof useRuleObservation>;
