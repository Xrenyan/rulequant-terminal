import type { DrawRecord, OperationLog, ReferenceHistoryItem, RuleLibraryBackup, RuleQuantConfig, RuleRecord, SampleCase } from "@/types/domain";

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
