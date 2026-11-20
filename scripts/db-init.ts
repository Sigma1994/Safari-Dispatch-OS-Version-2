import "dotenv/config";
import {
  closePgPool,
  DEFAULT_CHECKPOINT_DB_PATH,
  DEFAULT_DB_PATH,
  getPgConfig,
  getPgPool,
  initPostgresDb,
  initSqliteDb,
} from "../server/db.ts";

function parseArgs(argv: string[]) {
  const schemaOnly = argv.includes("--schema-only");
  const seedOnly = argv.includes("--seed-only");
  const reset = argv.includes("--reset");
  const targetArg = argv.find((a) => a.startsWith("--target="));
  const target = (targetArg ? targetArg.split("=")[1] : process.env.DB_CLIENT ?? "auto").toLowerCase();
  return { schemaOnly, seedOnly, reset, target };
}

async function main() {
  const { schemaOnly, seedOnly, reset, target } = parseArgs(process.argv.slice(2));
  const pgCfg = getPgConfig();

  if (target === "sqlite") {
    initSqliteDb(DEFAULT_DB_PATH, DEFAULT_CHECKPOINT_DB_PATH, reset);
    console.log(`[SQLite] Initialized ${DEFAULT_DB_PATH} and ${DEFAULT_CHECKPOINT_DB_PATH} (reset=${reset}).`);
    return;
  }

  try {
    const client = await getPgPool().connect();
    client.release();

    await initPostgresDb({ schemaOnly, seedOnly, reset });

    const countsClient = await getPgPool().connect();
    try {
      const circuits = await countsClient.query<{ cnt: string }>("SELECT COUNT(*) AS cnt FROM circuits");
      const fleet = await countsClient.query<{ cnt: string }>("SELECT COUNT(*) AS cnt FROM fleet");
      const guides = await countsClient.query<{ cnt: string }>("SELECT COUNT(*) AS cnt FROM guides");
      const bookings = await countsClient.query<{ cnt: string }>("SELECT COUNT(*) AS cnt FROM bookings");
      console.log(
        `[PostgreSQL] Ready at ${pgCfg.host}:${pgCfg.port}/${pgCfg.database} — ` +
          `circuits=${circuits.rows[0].cnt}, fleet=${fleet.rows[0].cnt}, guides=${guides.rows[0].cnt}, bookings=${bookings.rows[0].cnt}`
      );
    } finally {
      countsClient.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (target === "postgres") {
      console.error(
        `[PostgreSQL] Connection failed at ${pgCfg.host}:${pgCfg.port}/${pgCfg.database}: ${msg}\n` +
          `Start Docker Desktop and run: docker compose up -d`
      );
      process.exitCode = 1;
      return;
    }
    console.warn(`[PostgreSQL] Unreachable (${msg}). Falling back to SQLite initialization...`);
    initSqliteDb(DEFAULT_DB_PATH, DEFAULT_CHECKPOINT_DB_PATH, reset);
    console.log(`[SQLite] Initialized ${DEFAULT_DB_PATH} and ${DEFAULT_CHECKPOINT_DB_PATH} (reset=${reset}).`);
  } finally {
    await closePgPool();
  }
}

main().catch((err) => {
  console.error("Database initialization failed:", err);
  process.exit(1);
});
