import "../../src/lib/load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "../../src/db/client";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required to run the test suite (tests/jobs.test.ts exercises the real job queue " +
      "against Postgres). Set it in .env.local — the same Supabase project you use for dev is fine; " +
      "these tests only touch the `jobs` table and clean up after themselves.",
  );
}

// Idempotent: drizzle tracks applied migrations, so re-running this across test files is a no-op.
await migrate(db, { migrationsFolder: "./src/db/migrations" });
