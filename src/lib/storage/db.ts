"use client";

import Dexie, { type Table } from "dexie";
import type { DrawRecord, OperationLog, ReferenceHistoryItem, RuleLibraryBackup, RuleQuantConfig, RuleRecord, SampleCase } from "@/types/domain";

export type ConfigRow = {
  id: "default";
  value: RuleQuantConfig;
};

class RuleQuantDatabase extends Dexie {
  draws!: Table<DrawRecord, string>;
  rules!: Table<RuleRecord, string>;
  samples!: Table<SampleCase, string>;
  config!: Table<ConfigRow, string>;
  logs!: Table<OperationLog, string>;
  backups!: Table<RuleLibraryBackup, string>;
  referenceHistory!: Table<ReferenceHistoryItem, string>;

  constructor() {
    super("rulequant-terminal");
    this.version(1).stores({
      draws: "issue,date",
      rules: "id,category,enabled",
      samples: "id,ruleId,issue",
      config: "id",
    });
    this.version(2).stores({
      draws: "issue,date",
      rules: "id,category,enabled,sourceType",
      samples: "id,ruleId,issue",
      config: "id",
      logs: "id,timestamp,type,ruleId,issue",
      backups: "id,createdAt",
    });
    this.version(3).stores({
      draws: "issue,date",
      rules: "id,category,enabled,sourceType",
      samples: "id,ruleId,issue",
      config: "id",
      logs: "id,timestamp,type,ruleId,issue",
      backups: "id,createdAt",
      referenceHistory: "id,baseIssue,generatedAt,savedAt,signature",
    });
    this.version(4).stores({
      draws: "issue,date",
      rules: "id,category,enabled,sourceType",
      samples: "id,ruleId,issue",
      config: "id",
      logs: "id,timestamp,type,ruleId,issue",
      backups: "id,createdAt",
      referenceHistory: "id,baseIssue,targetIssue,generatedAt,savedAt,signature,saveType",
    });
  }
}

export const db = new RuleQuantDatabase();

export async function loadPersistedState() {
  const [draws, rules, samples, config, logs, backups, referenceHistory] = await Promise.all([
    db.draws.toArray(),
    db.rules.toArray(),
    db.samples.toArray(),
    db.config.get("default"),
    db.logs.orderBy("timestamp").reverse().toArray(),
    db.backups.orderBy("createdAt").reverse().toArray(),
    db.referenceHistory.orderBy("savedAt").reverse().toArray(),
  ]);
  return { draws, rules, samples, config: config?.value, logs, backups, referenceHistory };
}

export async function persistAll(input: {
  draws: DrawRecord[];
  rules: RuleRecord[];
  samples: SampleCase[];
  config: RuleQuantConfig;
  logs: OperationLog[];
  backups: RuleLibraryBackup[];
  referenceHistory: ReferenceHistoryItem[];
}) {
  await db.transaction("rw", [db.draws, db.rules, db.samples, db.config, db.logs, db.backups, db.referenceHistory], async () => {
    await db.draws.clear();
    await db.rules.clear();
    await db.samples.clear();
    await db.logs.clear();
    await db.backups.clear();
    await db.referenceHistory.clear();
    await db.draws.bulkPut(input.draws);
    await db.rules.bulkPut(input.rules);
    await db.samples.bulkPut(input.samples);
    await db.config.put({ id: "default", value: input.config });
    await db.logs.bulkPut(input.logs);
    await db.backups.bulkPut(input.backups);
    await db.referenceHistory.bulkPut(input.referenceHistory);
  });
}

export async function persistReferenceHistoryAndLogs(referenceHistory: ReferenceHistoryItem[], logs: OperationLog[]) {
  await db.transaction("rw", [db.referenceHistory, db.logs], async () => {
    await db.referenceHistory.clear();
    await db.logs.clear();
    await db.referenceHistory.bulkPut(referenceHistory);
    await db.logs.bulkPut(logs);
  });
}
