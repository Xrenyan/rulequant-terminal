import type { RuleRecord, RuleSourceType } from "@/types/domain";

export type RuleLibraryDraft = Partial<RuleRecord> & {
  id?: string;
  name?: string;
  category?: RuleRecord["category"];
  orderMode?: RuleRecord["orderMode"];
  formula?: string;
};

export type AddRuleToLibraryInput = {
  existingRules: RuleRecord[];
  draft: RuleLibraryDraft;
  mode?: "add" | "update";
  allowDuplicate?: boolean;
  now?: string;
};

export type AddRuleToLibrarySuccess = {
  ok: true;
  rule: RuleRecord;
  rules: RuleRecord[];
  signature: string;
  duplicate?: RuleRecord;
  message: string;
};

export type AddRuleToLibraryFailure = {
  ok: false;
  rules: RuleRecord[];
  reason: string;
  errors: string[];
  duplicate?: RuleRecord;
  signature?: string;
};

export type AddRuleToLibraryResult = AddRuleToLibrarySuccess | AddRuleToLibraryFailure;

export type AddRulesToLibraryResult = {
  rules: RuleRecord[];
  added: RuleRecord[];
  duplicates: RuleRecord[];
  failed: AddRuleToLibraryFailure[];
};

function compact(value: unknown): string {
  return String(value ?? "").trim();
}

function nextRuleId(sourceType: RuleSourceType, now: string): string {
  const prefix = sourceType === "system_recommended" ? "rule-system" : sourceType === "txt_import" ? "rule-txt" : sourceType === "copied" ? "rule-copy" : "rule";
  return `${prefix}-${Date.parse(now) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizedPattern(pattern?: number[]): number[] {
  return (pattern ?? []).map(Number).filter((item) => Number.isFinite(item));
}

export function buildRuleSignature(rule: Pick<RuleRecord, "category" | "target" | "orderMode" | "formula" | "normalizer" | "positionPattern" | "verifyOffset">): string {
  return [
    rule.category,
    rule.target,
    rule.orderMode,
    compact(rule.formula).replace(/\s+/g, ""),
    compact(rule.normalizer),
    normalizedPattern(rule.positionPattern).join(","),
    String(rule.verifyOffset ?? 1),
  ].join("|");
}

export function normalizeRuleDraft(draft: RuleLibraryDraft, options: { now?: string; existingRule?: RuleRecord; forceNewId?: boolean } = {}): RuleRecord {
  const now = options.now ?? new Date().toISOString();
  const sourceType = draft.sourceType ?? options.existingRule?.sourceType ?? "manual";
  const id = options.forceNewId || !draft.id ? nextRuleId(sourceType, now) : draft.id;
  const rule: RuleRecord = {
    id,
    name: compact(draft.name) || "未命名规则",
    category: draft.category ?? options.existingRule?.category ?? "kill_zodiac",
    orderMode: draft.orderMode ?? options.existingRule?.orderMode ?? "L",
    formula: compact(draft.formula) || options.existingRule?.formula || "平1",
    normalizer: compact(draft.normalizer) || options.existingRule?.normalizer || "auto",
    target: compact(draft.target) || options.existingRule?.target || "special",
    verifyMode: "next_special",
    positionPattern: normalizedPattern(draft.positionPattern ?? options.existingRule?.positionPattern),
    anchorIssue: draft.anchorIssue ?? options.existingRule?.anchorIssue,
    anchorPatternIndex: draft.anchorPatternIndex ?? options.existingRule?.anchorPatternIndex,
    positionMeaning: draft.positionMeaning ?? options.existingRule?.positionMeaning,
    periodSpan: Number(draft.periodSpan ?? options.existingRule?.periodSpan ?? 1) || 1,
    verifyOffset: Number(draft.verifyOffset ?? options.existingRule?.verifyOffset ?? draft.periodSpan ?? options.existingRule?.periodSpan ?? 1) || 1,
    enabled: draft.enabled ?? options.existingRule?.enabled ?? true,
    manuallyConfirmed: draft.manuallyConfirmed ?? options.existingRule?.manuallyConfirmed ?? false,
    participatesInReference: draft.participatesInReference ?? options.existingRule?.participatesInReference ?? true,
    sourceType,
    origin: draft.origin ?? options.existingRule?.origin,
    canCompute: draft.canCompute ?? options.existingRule?.canCompute,
    parseStatus: draft.parseStatus ?? options.existingRule?.parseStatus ?? "parsed",
    verifyStatus: draft.verifyStatus ?? options.existingRule?.verifyStatus ?? "unchecked",
    tags: draft.tags ?? options.existingRule?.tags ?? [],
    description: draft.description ?? options.existingRule?.description ?? "",
    sourceFile: draft.sourceFile ?? options.existingRule?.sourceFile ?? "",
    examples: draft.examples ?? options.existingRule?.examples ?? [],
    createdAt: options.existingRule && !options.forceNewId ? options.existingRule.createdAt : (draft.createdAt ?? now),
    updatedAt: now,
    fromCandidateId: draft.fromCandidateId ?? options.existingRule?.fromCandidateId,
    fromTextId: draft.fromTextId ?? options.existingRule?.fromTextId,
  };

  return {
    ...rule,
    librarySignature: buildRuleSignature(rule),
  };
}

export function validateRuleForLibrary(rule: RuleRecord): string[] {
  const errors: string[] = [];
  if (!compact(rule.name)) errors.push("缺少规则名称");
  if (!rule.category) errors.push("缺少规则类型");
  if (!rule.orderMode) errors.push("缺少 L序 / D序");
  if (!compact(rule.formula)) errors.push("缺少公式内容");
  if (!compact(rule.normalizer)) errors.push("缺少归一化方式");
  if (!compact(rule.target)) errors.push("缺少目标类型");
  if (rule.parseStatus === "failed") errors.push("规则解析失败");
  return errors;
}

export function addRuleToLibrary(input: AddRuleToLibraryInput): AddRuleToLibraryResult {
  const now = input.now ?? new Date().toISOString();
  const existingRule = input.mode === "update" && input.draft.id ? input.existingRules.find((rule) => rule.id === input.draft.id) : undefined;
  const rule = normalizeRuleDraft(input.draft, {
    now,
    existingRule,
    forceNewId: input.mode !== "update",
  });
  const errors = validateRuleForLibrary(rule);
  if (errors.length) {
    return { ok: false, rules: input.existingRules, reason: errors.join("；"), errors, signature: rule.librarySignature };
  }

  const signature = rule.librarySignature ?? buildRuleSignature(rule);
  const duplicate = input.allowDuplicate ? undefined : input.existingRules.find((item) => item.id !== rule.id && buildRuleSignature(item) === signature);
  if (duplicate) {
    return {
      ok: false,
      rules: input.existingRules,
      reason: "这条规则已存在于公式库",
      errors: ["重复规则"],
      duplicate,
      signature,
    };
  }

  const withoutCurrent = input.existingRules.filter((item) => item.id !== rule.id);
  const rules = [rule, ...withoutCurrent];
  return {
    ok: true,
    rule,
    rules,
    signature,
    message: input.mode === "update" && existingRule ? "规则已更新" : "规则已加入公式库",
  };
}

export function addRulesToLibrary(existingRules: RuleRecord[], drafts: RuleLibraryDraft[], options: { now?: string } = {}): AddRulesToLibraryResult {
  let rules = existingRules;
  const added: RuleRecord[] = [];
  const duplicates: RuleRecord[] = [];
  const failed: AddRuleToLibraryFailure[] = [];

  drafts.forEach((draft) => {
    const result = addRuleToLibrary({ existingRules: rules, draft, mode: "add", now: options.now });
    if (result.ok) {
      rules = result.rules;
      added.push(result.rule);
    } else if (result.duplicate) {
      duplicates.push(result.duplicate);
    } else {
      failed.push(result);
    }
  });

  return { rules, added, duplicates, failed };
}
