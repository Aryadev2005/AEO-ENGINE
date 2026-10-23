import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required (a Postgres connection string — see .env.example)");
}

// `prepare: false` is required when connecting through Supabase's transaction-mode
// pooler (and most serverless-friendly poolers) — pooled connections can't hold
// server-side prepared statements across requests.
export const sql = postgres(DATABASE_URL, { prepare: false });

export const db = drizzle(sql, { schema });
export { schema };
