import "server-only";
import path from "node:path";
import * as schema from "./schema";

// DATABASE_URL: a Postgres URL (Neon in production) or "pglite:<dir>" for an embedded
// Postgres used in local development and tests. Migrations in ./drizzle are applied on first use.
type AnyDb = import("drizzle-orm/pglite").PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: Promise<AnyDb> };

async function connect(): Promise<AnyDb> {
  const url = process.env.DATABASE_URL ?? "pglite:./.data/pglite";
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = url.slice("pglite:".length);
    if (dir !== "memory") (await import("node:fs")).mkdirSync(path.resolve(dir), { recursive: true });
    const client = dir === "memory" ? new PGlite() : new PGlite(path.resolve(dir));
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return db;
  }
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const db = drizzle(new Pool({ connectionString: url }), { schema });
  if (process.env.RUN_MIGRATIONS === "1") {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db, { migrationsFolder });
  }
  return db as unknown as AnyDb;
}

export function getDb(): Promise<AnyDb> {
  // A failed connection is not cached, so the next request retries.
  g.__db ??= connect().catch((e) => { g.__db = undefined; throw e; });
  return g.__db;
}

export { schema };
