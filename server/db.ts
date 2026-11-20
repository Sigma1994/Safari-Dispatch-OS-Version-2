import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import pg from "pg";
import { BookingConflictError, type DbStatusInfo } from "./types.ts";

const { Pool, types } = pg;

// Keep PostgreSQL DATE (OID 1082) as 'YYYY-MM-DD' strings to match SQLite cleanly
types.setTypeParser(1082, (val: string) => val);

const ROOT = process.cwd();
export const DEFAULT_DB_PATH = path.join(ROOT, "data", "safari_dispatch.db");
export const DEFAULT_CHECKPOINT_DB_PATH = path.join(ROOT, "data", "checkpoints.db");
export const SCHEMA_PATH = path.join(ROOT, "data", "schema.sql");
export const SEED_PATH = path.join(ROOT, "data", "seed.sql");
export const PG_SCHEMA_PATH = path.join(ROOT, "data", "postgres_schema.sql");
export const PG_SEED_PATH = path.join(ROOT, "data", "postgres_seed.sql");

export interface DbConn {
  engine: "postgres" | "sqlite";
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid?: number; changes: number }>;
  exec(sql: string): Promise<void>;
}

export function getPgConfig() {
  const portRaw = Number(process.env.PGPORT ?? "5432");
  return {
    host: process.env.PGHOST ?? "localhost",
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 5432,
    database: process.env.PGDATABASE ?? "safari_dispatch",
    user: process.env.PGUSER ?? "safari",
    password: process.env.PGPASSWORD ?? "safari_dev",
  };
}

export function getConfiguredDbMode(): "auto" | "postgres" | "sqlite" {
  const raw = (process.env.DB_CLIENT ?? "auto").trim().toLowerCase();
  if (raw === "postgres" || raw === "sqlite") return raw;
  return "auto";
}

let _pgPool: pg.Pool | null = null;
let _activeEngine: "postgres" | "sqlite" = "sqlite";
let _pgError: string | undefined;

export function getPgPool(): pg.Pool {
  if (!_pgPool) {
    const cfg = getPgConfig();
    _pgPool = new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      max: 10,
      connectionTimeoutMillis: 400,
    });
    _pgPool.on("error", (err) => {
      console.error("[DB] Unexpected idle PostgreSQL client error:", err.message);
    });
  }
  return _pgPool;
}

export async function closePgPool(): Promise<void> {
  if (_pgPool) {
    await _pgPool.end();
    _pgPool = null;
  }
}

export function toPgPlaceholders(sql: string): string {
  let idx = 0;
  let inSingleQuote = false;
  let out = "";
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" && sql[i - 1] !== "\\") {
      inSingleQuote = !inSingleQuote;
      out += ch;
    } else if (ch === "?" && !inSingleQuote) {
      idx += 1;
      out += `$${idx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function normalizePgRow<T>(row: Record<string, unknown>): T {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString().replace("T", " ").slice(0, 19);
    } else {
      normalized[key] = value;
    }
  }
  return normalized as T;
}

class SqliteDbConn implements DbConn {
  readonly engine = "sqlite" as const;
  private conn: DatabaseSync;

  constructor(conn: DatabaseSync) {
    this.conn = conn;
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const stmt = this.conn.prepare(sql);
    return stmt.get(...(params as SQLInputValue[])) as T | undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.conn.prepare(sql);
    return stmt.all(...(params as SQLInputValue[])) as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid?: number; changes: number }> {
    const res = this.conn.prepare(sql).run(...(params as SQLInputValue[]));
    return {
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined,
      changes: Number(res.changes ?? 0),
    };
  }

  async exec(sql: string): Promise<void> {
    this.conn.exec(sql);
  }
}

class PostgresDbConn implements DbConn {
  readonly engine = "postgres" as const;
  private client: pg.PoolClient;

  constructor(client: pg.PoolClient) {
    this.client = client;
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const pgSql = toPgPlaceholders(sql);
    const res = await this.client.query(pgSql, params);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? normalizePgRow<T>(row) : undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const pgSql = toPgPlaceholders(sql);
    const res = await this.client.query(pgSql, params);
    return (res.rows as Array<Record<string, unknown>>).map((r) => normalizePgRow<T>(r));
  }

  async run(sql: string, ...params: unknown[]): Promise<{ lastInsertRowid?: number; changes: number }> {
    let pgSql = toPgPlaceholders(sql);
    const wantsReturningId =
      /^\s*INSERT\s+INTO\s+(bookings|circuits|fleet|guides|vehicle_allocations|booking_guides|audit_log)\b/i.test(
        pgSql
      ) && !/\bRETURNING\b/i.test(pgSql);
    if (wantsReturningId) {
      pgSql = `${pgSql.replace(/;\s*$/, "")} RETURNING id`;
    }
    const res = await this.client.query(pgSql, params);
    const insertedId = res.rows[0]?.id !== undefined ? Number(res.rows[0].id) : undefined;
    return {
      lastInsertRowid: insertedId,
      changes: res.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }
}

let _resolvedBusinessDbPath: string | null = null;
let _resolvedCheckpointDbPath: string | null = null;

function isWritableTarget(targetPath: string): boolean {
  try {
    const dir = path.dirname(targetPath);
    if (fs.existsSync(targetPath)) {
      fs.accessSync(targetPath, fs.constants.R_OK | fs.constants.W_OK);
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    }
    let probe = dir;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    fs.accessSync(probe, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveEffectiveDbPath(dbPath: string = DEFAULT_DB_PATH): string {
  const abs = path.resolve(dbPath);
  const uidSuffix = typeof process.getuid === "function" ? String(process.getuid()) : "app";
  const tmpDataDir = path.join(os.tmpdir(), `safari-dispatch-data-${uidSuffix}`);
  if (abs === path.resolve(DEFAULT_DB_PATH)) {
    if (!_resolvedBusinessDbPath) {
      _resolvedBusinessDbPath = isWritableTarget(DEFAULT_DB_PATH)
        ? DEFAULT_DB_PATH
        : path.join(tmpDataDir, "safari_dispatch.db");
    }
    return _resolvedBusinessDbPath;
  }
  if (abs === path.resolve(DEFAULT_CHECKPOINT_DB_PATH)) {
    if (!_resolvedCheckpointDbPath) {
      _resolvedCheckpointDbPath = isWritableTarget(DEFAULT_CHECKPOINT_DB_PATH)
        ? DEFAULT_CHECKPOINT_DB_PATH
        : path.join(tmpDataDir, "checkpoints.db");
    }
    return _resolvedCheckpointDbPath;
  }
  return dbPath;
}

export function getConn(dbPath: string = DEFAULT_DB_PATH): DatabaseSync {
  const effectivePath = resolveEffectiveDbPath(dbPath);
  fs.mkdirSync(path.dirname(effectivePath), { recursive: true });
  const conn = new DatabaseSync(effectivePath, { timeout: 30000 });
  conn.exec("PRAGMA foreign_keys = ON;");
  conn.exec("PRAGMA busy_timeout = 30000;");
  return conn;
}

function shouldUsePostgres(dbPath?: string): boolean {
  if (dbPath && path.resolve(dbPath) !== path.resolve(DEFAULT_DB_PATH) && path.resolve(dbPath) !== path.resolve(DEFAULT_CHECKPOINT_DB_PATH)) {
    return false;
  }
  return _activeEngine === "postgres";
}

export async function readConn<T>(
  fn: (conn: DbConn) => Promise<T> | T,
  dbPath: string = DEFAULT_DB_PATH
): Promise<T> {
  if (shouldUsePostgres(dbPath)) {
    const client = await getPgPool().connect();
    try {
      return await fn(new PostgresDbConn(client));
    } finally {
      client.release();
    }
  }
  const conn = getConn(dbPath);
  try {
    return await fn(new SqliteDbConn(conn));
  } finally {
    conn.close();
  }
}

export async function writeTx<T>(
  fn: (conn: DbConn) => Promise<T> | T,
  dbPath: string = DEFAULT_DB_PATH
): Promise<T> {
  if (shouldUsePostgres(dbPath)) {
    const client = await getPgPool().connect();
    let inTx = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE;");
      inTx = true;
      const result = await fn(new PostgresDbConn(client));
      await client.query("COMMIT;");
      inTx = false;
      return result;
    } catch (err) {
      if (inTx) {
        try {
          await client.query("ROLLBACK;");
        } catch {
          // Ignore rollback failure
        }
      }
      const pgErr = err as { code?: string; message?: string };
      if (pgErr?.code === "23P01" || pgErr?.code === "40001") {
        throw new BookingConflictError(
          `Database serialization/exclusion lock prevented overlapping allocation: ${pgErr.message ?? pgErr.code}`
        );
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const conn = getConn(dbPath);
  let inTx = false;
  try {
    conn.exec("BEGIN IMMEDIATE;");
    inTx = true;
    const result = await fn(new SqliteDbConn(conn));
    conn.exec("COMMIT;");
    inTx = false;
    return result;
  } catch (err) {
    if (inTx) {
      try {
        conn.exec("ROLLBACK;");
      } catch {
        // Ignore rollback errors after original failure
      }
    }
    throw err;
  } finally {
    conn.close();
  }
}

function alignOwnershipWithWorkspace(targetPath: string): void {
  try {
    if (typeof process.getuid === "function" && process.getuid() === 0 && fs.existsSync(targetPath)) {
      const wsStat = fs.statSync(ROOT);
      fs.chownSync(targetPath, wsStat.uid, wsStat.gid);
    }
  } catch {
    // Best-effort when running as root inside containerized preview
  }
}

export function initSqliteDb(
  businessDbPath: string = DEFAULT_DB_PATH,
  checkpointDbPath: string = DEFAULT_CHECKPOINT_DB_PATH,
  reset: boolean = false
): string {
  const effectiveBizPath = resolveEffectiveDbPath(businessDbPath);
  const effectiveCkptPath = resolveEffectiveDbPath(checkpointDbPath);

  const bizDir = path.dirname(effectiveBizPath);
  const ckptDir = path.dirname(effectiveCkptPath);
  fs.mkdirSync(bizDir, { recursive: true });
  fs.mkdirSync(ckptDir, { recursive: true });
  alignOwnershipWithWorkspace(bizDir);
  alignOwnershipWithWorkspace(ckptDir);

  if (reset) {
    for (const p of [effectiveBizPath, `${effectiveBizPath}-wal`, `${effectiveBizPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    for (const p of [effectiveCkptPath, `${effectiveCkptPath}-wal`, `${effectiveCkptPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } else {
    if (
      path.resolve(effectiveBizPath) !== path.resolve(businessDbPath) &&
      !fs.existsSync(effectiveBizPath) &&
      fs.existsSync(businessDbPath)
    ) {
      fs.copyFileSync(businessDbPath, effectiveBizPath);
      fs.chmodSync(effectiveBizPath, 0o666);
    }
    if (
      path.resolve(effectiveCkptPath) !== path.resolve(checkpointDbPath) &&
      !fs.existsSync(effectiveCkptPath) &&
      fs.existsSync(checkpointDbPath)
    ) {
      fs.copyFileSync(checkpointDbPath, effectiveCkptPath);
      fs.chmodSync(effectiveCkptPath, 0o666);
    }
  }

  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const seedSql = fs.readFileSync(SEED_PATH, "utf-8");

  const conn = getConn(effectiveBizPath);
  try {
    conn.exec("PRAGMA journal_mode = WAL;");
    conn.exec(schemaSql);
    const cols = conn.prepare("PRAGMA table_info(bookings)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "customer_name")) {
      conn.exec("ALTER TABLE bookings ADD COLUMN customer_name TEXT;");
    }
    conn.exec(seedSql);
    conn.exec("UPDATE bookings SET customer_name = 'Wanjiru & Associates' WHERE id = 1 AND customer_name IS NULL;");
  } finally {
    conn.close();
  }

  const ckpt = getConn(effectiveCkptPath);
  try {
    ckpt.exec("PRAGMA journal_mode = WAL;");
    ckpt.exec(`
      CREATE TABLE IF NOT EXISTS workflow_checkpoints (
        thread_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        paused INTEGER NOT NULL DEFAULT 0,
        interrupt_json TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    ckpt.close();
  }

  for (const p of [
    effectiveBizPath,
    `${effectiveBizPath}-wal`,
    `${effectiveBizPath}-shm`,
    effectiveCkptPath,
    `${effectiveCkptPath}-wal`,
    `${effectiveCkptPath}-shm`,
  ]) {
    alignOwnershipWithWorkspace(p);
  }

  return effectiveBizPath;
}

export async function initPostgresDb(options?: {
  schemaOnly?: boolean;
  seedOnly?: boolean;
  reset?: boolean;
}): Promise<void> {
  const client = await getPgPool().connect();
  try {
    if (options?.reset) {
      await client.query(`
        DROP TABLE IF EXISTS
          workflow_checkpoints,
          audit_log,
          idempotency_records,
          pending_approvals,
          booking_guides,
          vehicle_allocations,
          bookings,
          guides,
          fleet,
          circuits
        CASCADE;
      `);
    }
    if (!options?.seedOnly) {
      const pgSchema = fs.readFileSync(PG_SCHEMA_PATH, "utf-8");
      await client.query(pgSchema);
    }
    if (!options?.schemaOnly) {
      const pgSeed = fs.readFileSync(PG_SEED_PATH, "utf-8");
      await client.query(pgSeed);
    }
  } finally {
    client.release();
  }
}

export async function initDb(
  businessDbPath: string = DEFAULT_DB_PATH,
  checkpointDbPath: string = DEFAULT_CHECKPOINT_DB_PATH,
  reset: boolean = false
): Promise<string> {
  const isDefaultDb = path.resolve(businessDbPath) === path.resolve(DEFAULT_DB_PATH);
  if (!isDefaultDb) {
    return initSqliteDb(businessDbPath, checkpointDbPath, reset);
  }

  const mode = getConfiguredDbMode();
  if (mode !== "sqlite") {
    try {
      const client = await getPgPool().connect();
      try {
        const reg = await client.query<{ tbl: string | null }>("SELECT to_regclass('public.circuits') AS tbl;");
        const exists = Boolean(reg.rows[0]?.tbl);
        if (reset || !exists) {
          client.release();
          await initPostgresDb({ reset });
        } else {
          client.release();
        }
      } catch (err) {
        client.release();
        throw err;
      }
      _activeEngine = "postgres";
      _pgError = undefined;
      return "postgres";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      _pgError = msg;
      if (process.env.REQUIRE_POSTGRES === "1") {
        throw new Error(
          `REQUIRE_POSTGRES=1 is set, but PostgreSQL is unreachable (${msg}). Start Docker Desktop and run: docker compose up -d`
        );
      }
      console.warn(`[DB] PostgreSQL unreachable (${msg}); falling back to SQLite.`);
    }
  } else {
    _pgError = "Disabled via DB_CLIENT=sqlite";
  }

  _activeEngine = "sqlite";
  return initSqliteDb(businessDbPath, checkpointDbPath, reset);
}

export async function getDbStatus(): Promise<DbStatusInfo> {
  const cfg = getPgConfig();
  const mode = getConfiguredDbMode();
  let reachable = false;
  let error = _pgError;

  if (mode !== "sqlite") {
    try {
      const client = await getPgPool().connect();
      await client.query("SELECT 1;");
      client.release();
      reachable = true;
      error = undefined;
    } catch (err) {
      reachable = false;
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    active_engine: _activeEngine,
    configured_mode: mode,
    postgres: {
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      reachable,
      error,
    },
  };
}

export async function logAudit(
  threadId: string,
  nodeName: string,
  decision: string,
  details: unknown,
  dbPath: string = DEFAULT_DB_PATH
): Promise<void> {
  const payload = typeof details === "string" ? details : JSON.stringify(details);
  await writeTx(async (conn) => {
    await conn.run(
      "INSERT INTO audit_log (thread_id, node_name, decision, details_json) VALUES (?, ?, ?, ?)",
      threadId,
      nodeName,
      decision,
      payload
    );
  }, dbPath);
}
