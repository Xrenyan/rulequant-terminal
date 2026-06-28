import type { OperationLog, RuleQuantConfig } from "@/types/domain";
import { EMPTY_CLOUD_STATE, mergeManualCloudDraws, summarizeDraws, type RuleQuantCloudState } from "@/lib/cloud/cloud-state";

type PostgresModule = typeof import("postgres");
type SqlClient = ReturnType<PostgresModule>;

let sqlClient: SqlClient | null = null;
let schemaReady = false;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

export function isCloudDatabaseConfigured() {
  return Boolean(databaseUrl());
}

async function getSql() {
  const url = databaseUrl();
  if (!url) return null;
  if (!sqlClient) {
    const postgresModule = await import("postgres");
    const postgres = ("default" in postgresModule ? postgresModule.default : postgresModule) as unknown as PostgresModule;
    sqlClient = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return sqlClient;
}

async function ensureSchema() {
  if (schemaReady) return;
  const sql = await getSql();
  if (!sql) return;
  await sql`
    create table if not exists rulequant_state (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  schemaReady = true;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const sql = await getSql();
  if (!sql) return fallback;
  await ensureSchema();
  const rows = await sql<{ value: T }[]>`select value from rulequant_state where key = ${key} limit 1`;
  return rows[0]?.value ?? fallback;
}

async function writeJson(key: string, value: unknown) {
  const sql = await getSql();
  if (!sql) return;
  await ensureSchema();
  await sql`
    insert into rulequant_state (key, value, updated_at)
    values (${key}, ${sql.json(value as never)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

async function readUpdatedAt() {
  const sql = await getSql();
  if (!sql) return undefined;
  await ensureSchema();
  const rows = await sql<{ updated_at: Date }[]>`
    select max(updated_at) as updated_at
    from rulequant_state
    where key in ('draws', 'rules', 'samples', 'config', 'logs', 'backups', 'referenceHistory')
  `;
  return rows[0]?.updated_at?.toISOString();
}

export async function loadCloudState(): Promise<RuleQuantCloudState> {
  if (!isCloudDatabaseConfigured()) {
    return {
      ...EMPTY_CLOUD_STATE,
      meta: {
        ...EMPTY_CLOUD_STATE.meta,
        message: "DATABASE_URL is not configured",
      },
    };
  }

  const [draws, rules, samples, config, logs, backups, referenceHistory, updatedAt] = await Promise.all([
    readJson<RuleQuantCloudState["draws"]>("draws", []),
    readJson<RuleQuantCloudState["rules"]>("rules", []),
    readJson<RuleQuantCloudState["samples"]>("samples", []),
    readJson<RuleQuantConfig | undefined>("config", undefined),
    readJson<RuleQuantCloudState["logs"]>("logs", []),
    readJson<RuleQuantCloudState["backups"]>("backups", []),
    readJson<RuleQuantCloudState["referenceHistory"]>("referenceHistory", []),
    readUpdatedAt(),
  ]);

  const summary = summarizeDraws(draws);
  return {
    draws: summary.sorted,
    rules,
    samples,
    config,
    logs,
    backups,
    referenceHistory,
    meta: {
      enabled: true,
      source: "postgres",
      updatedAt,
      latestIssue: summary.latestIssue,
      recordCount: summary.recordCount,
    },
  };
}

export async function saveCloudStatePatch(patch: Partial<Omit<RuleQuantCloudState, "meta">>) {
  if (!isCloudDatabaseConfigured()) return loadCloudState();
  const writes: Array<Promise<void>> = [];
  if (patch.draws) {
    const [currentDraws, currentLogs] = await Promise.all([
      readJson<RuleQuantCloudState["draws"]>("draws", []),
      readJson<RuleQuantCloudState["logs"]>("logs", []),
    ]);
    writes.push(writeJson("draws", mergeManualCloudDraws({
      incomingDraws: patch.draws,
      currentDraws,
      logs: patch.logs ?? currentLogs,
    })));
  }
  if (patch.rules) writes.push(writeJson("rules", patch.rules));
  if (patch.samples) writes.push(writeJson("samples", patch.samples));
  if (patch.config) writes.push(writeJson("config", patch.config));
  if (patch.logs) writes.push(writeJson("logs", patch.logs));
  if (patch.backups) writes.push(writeJson("backups", patch.backups));
  if (patch.referenceHistory) writes.push(writeJson("referenceHistory", patch.referenceHistory));
  await Promise.all(writes);
  return loadCloudState();
}

export async function appendCloudLog(log: OperationLog) {
  const current = await loadCloudState();
  const logs = [log, ...current.logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
  return saveCloudStatePatch({ logs });
}
