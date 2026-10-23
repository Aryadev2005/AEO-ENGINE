import "../lib/load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./client";

async function main() {
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
