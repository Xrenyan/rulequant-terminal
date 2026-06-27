"use client";

import Dexie, { type Table } from "dexie";
import type { DrawRecord, OperationLog, RuleLibraryBackup, RuleQuantConfig, RuleRecord, SampleCase } from "@/types/domain";

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
  }
}

export const db = new RuleQuantDatabase();

export async function loadPersistedState() {
  const [draws, rules, samples, config, logs, backups] = await Promise.all([
    db.draws.toArray(),
    db.rules.toArray(),
    db.samples.toArray(),
    db.config.get("default"),
    db.logs.orderBy("timestamp").reverse().toArray(),
    db.backups.orderBy("createdAt").reverse().toArray(),
  ]);
  return { draws, rules, samples, config: config?.value, logs, backups };
}

export async function persistAll(input: {
  draws: DrawRecord[];
  rules: RuleRecord[];
  samples: SampleCase[];
  config: RuleQuantConfig;
  logs: OperationLog[];
  backups: RuleLibraryBackup[];
}) {
  await db.transaction("rw", [db.draws, db.rules, db.samples, db.config, db.logs, db.backups], async () => {
    await db.draws.clear();
    await db.rules.clear();
    await db.samples.clear();
    await db.logs.clear();
    await db.backups.clear();
    await db.draws.bulkPut(input.draws);
    await db.rules.bulkPut(input.rules);
    await db.samples.bulkPut(input.samples);
    await db.config.put({ id: "default", value: input.config });
    await db.logs.bulkPut(input.logs);
    await db.backups.bulkPut(input.backups);
  });
}
