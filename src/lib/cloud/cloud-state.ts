import type { DrawRecord, OperationLog, ReferenceHistoryItem, RuleLibraryBackup, RuleQuantConfig, RuleRecord, RuleSourceType, SampleCase } from "@/types/domain";

export type RuleQuantCloudState = {
  draws: DrawRecord[];
  rules: RuleRecord[];
  samples: SampleCase[];
  config?: RuleQuantConfig;
  logs: OperationLog[];
  backups: RuleLibraryBackup[];
  referenceHistory: ReferenceHistoryItem[];
  meta: {
    enabled: boolean;
    source: "postgres" | "github" | "disabled";
    updatedAt?: string;
    latestIssue?: string;
    recordCount?: number;
    message?: string;
  };
};

export const EMPTY_CLOUD_STATE: RuleQuantCloudState = {
  draws: [],
  rules: [],
  samples: [],
  logs: [],
  backups: [],
  referenceHistory: [],
  meta: {
    enabled: false,
    source: "disabled",
  },
};

export function summarizeDraws(draws: DrawRecord[]) {
  const sorted = [...draws].sort((a, b) => a.issue.localeCompare(b.issue, "zh-CN", { numeric: true }));
  const latest = sorted.at(-1);
  return {
    sorted,
    latestIssue: latest?.issue,
    recordCount: sorted.length,
  };
}

export function isManualCloudDraw(record: Pick<DrawRecord, "sourceUrl" | "rawAttributes">) {
  return record.sourceUrl === "manual://user-input" || record.rawAttributes?.sourceType === "manual";
}

export function manualDrawDeleteIssues(logs: OperationLog[] = []) {
  return new Set(
    logs
      .filter((log) => {
        const message = String(log.message ?? "");
        const sourceType = String(log.details?.sourceType ?? "");
        return log.type === "sync_draws"
          && Boolean(log.issue)
          && message.includes("删除开奖数据")
          && (message.includes("人工录入") || sourceType.includes("manual") || sourceType.includes("人工"));
      })
      .map((log) => String(log.issue)),
  );
}

export function mergeManualCloudDraws(input: {
  incomingDraws: DrawRecord[];
  currentDraws?: DrawRecord[];
  logs?: OperationLog[];
}) {
  const deletedIssues = manualDrawDeleteIssues(input.logs);
  const merged = new Map(input.incomingDraws.map((draw) => [draw.issue, draw]));
  (input.currentDraws ?? [])
    .filter(isManualCloudDraw)
    .filter((draw) => !deletedIssues.has(draw.issue))
    .forEach((draw) => {
      if (!merged.has(draw.issue)) merged.set(draw.issue, draw);
    });
  return summarizeDraws([...merged.values()]).sorted;
}

const userCreatedRuleSources = new Set<RuleSourceType>(["manual", "txt_import", "system_recommended", "copied"]);

export function isUserCreatedCloudRule(rule: Pick<RuleRecord, "sourceType">) {
  return userCreatedRuleSources.has(rule.sourceType ?? "user_provided");
}

export function userRuleDeleteIds(logs: OperationLog[] = []) {
  return new Set(
    logs
      .filter((log) => log.type === "rule_deleted" && Boolean(log.ruleId))
      .map((log) => String(log.ruleId)),
  );
}

export function mergeUserCreatedCloudRules(input: {
  incomingRules: RuleRecord[];
  currentRules?: RuleRecord[];
  logs?: OperationLog[];
}) {
  const deletedRuleIds = userRuleDeleteIds(input.logs);
  const merged = new Map(input.incomingRules.map((rule) => [rule.id, rule]));
  (input.currentRules ?? [])
    .filter(isUserCreatedCloudRule)
    .filter((rule) => !deletedRuleIds.has(rule.id))
    .forEach((rule) => {
      if (!merged.has(rule.id)) merged.set(rule.id, rule);
    });
  return [...merged.values()];
}
