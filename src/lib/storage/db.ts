"use client";

import Dexie, { type Table } from "dexie";
import type { DrawRecord, OperationLog, ReferenceHistoryItem, RuleLibraryBackup, RuleQuantConfig, RuleRecord, SampleCase } from "@/types/domain";
import {
  mergeRuleSnapshots,
  readRuleLibraryCacheSnapshot,
  readRuleLibrarySnapshot,
  writeRuleLibraryCacheSnapshot,
  writeRuleLibrarySnapshot,
} from "@/lib/storage/rule-snapshot";

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

let persistenceQueue: Promise<void> = Promise.resolve();

function enqueuePersistence(task: () => Promise<void>) {
  persistenceQueue = persistenceQueue.catch(() => undefined).then(task);
  return persistenceQueue;
}

export async function loadPersistedState() {
  const backupRules = mergeRuleSnapshots(readRuleLibrarySnapshot(), await readRuleLibraryCacheSnapshot());
  try {
    const [draws, rules, samples, config, logs, backups, referenceHistory] = await Promise.all([
      db.draws.toArray(),
      db.rules.toArray(),
      db.samples.toArray(),
      db.config.get("default"),
      db.logs.orderBy("timestamp").reverse().toArray(),
      db.backups.orderBy("createdAt").reverse().toArray(),
      db.referenceHistory.orderBy("savedAt").reverse().toArray(),
    ]);
    return { draws, rules: mergeRuleSnapshots(rules, backupRules), samples, config: config?.value, logs, backups, referenceHistory };
  } catch {
    return {
      draws: [] as DrawRecord[],
      rules: backupRules,
      samples: [] as SampleCase[],
      config: undefined,
      logs: [] as OperationLog[],
      backups: [] as RuleLibraryBackup[],
      referenceHistory: [] as ReferenceHistoryItem[],
    };
  }
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
  const snapshot = {
    draws: [...input.draws],
    rules: [...input.rules],
    samples: [...input.samples],
    config: input.config,
    logs: [...input.logs],
    backups: [...input.backups],
    referenceHistory: [...input.referenceHistory],
  };

  await enqueuePersistence(async () => {
    const localSnapshotSaved = writeRuleLibrarySnapshot(snapshot.rules);
    const cacheSnapshotSaved = await writeRuleLibraryCacheSnapshot(snapshot.rules);
    const backupSaved = localSnapshotSaved || cacheSnapshotSaved;
    try {
      await db.transaction("rw", [db.draws, db.rules, db.samples, db.config, db.logs, db.backups, db.referenceHistory], async () => {
        await db.draws.clear();
        await db.rules.clear();
        await db.samples.clear();
        await db.logs.clear();
        await db.backups.clear();
        await db.referenceHistory.clear();
        await db.draws.bulkPut(snapshot.draws);
        await db.rules.bulkPut(snapshot.rules);
        await db.samples.bulkPut(snapshot.samples);
        await db.config.put({ id: "default", value: snapshot.config });
        await db.logs.bulkPut(snapshot.logs);
        await db.backups.bulkPut(snapshot.backups);
        await db.referenceHistory.bulkPut(snapshot.referenceHistory);
      });
    } catch (error) {
      if (!backupSaved) throw error;
    }
  });
}

export async function persistReferenceHistoryAndLogs(referenceHistory: ReferenceHistoryItem[], logs: OperationLog[]) {
  const nextReferenceHistory = [...referenceHistory];
  const nextLogs = [...logs];
  await enqueuePersistence(async () => {
    await db.transaction("rw", [db.referenceHistory, db.logs], async () => {
      await db.referenceHistory.clear();
      await db.logs.clear();
      await db.referenceHistory.bulkPut(nextReferenceHistory);
      await db.logs.bulkPut(nextLogs);
    });
  });
}
