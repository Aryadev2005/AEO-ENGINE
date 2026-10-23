import { and, eq, isNull, lte, ne, or } from "drizzle-orm";
import { ALL_ENGINES } from "../engine/providers";
import { db, schema } from "./client";
import { enqueueScan } from "./scan-service";

const SCHEDULE_INTERVAL_MS: Record<"weekly" | "daily", number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

/**
 * Enqueues a scan for every brand whose weekly/daily schedule is due (spec
 * §5/§8). Shared by the standalone worker's hourly node-cron tick and the
 * serverless `/api/cron/run-due` endpoint — same logic, two triggers.
 */
export async function enqueueDueScheduledScans(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(schema.brands)
    .where(
      and(
        ne(schema.brands.schedule, "off"),
        or(isNull(schema.brands.nextScanAt), lte(schema.brands.nextScanAt, now)),
      ),
    );

  for (const brand of due) {
    await enqueueScan(brand.id, ALL_ENGINES, "schedule");
    const intervalMs = SCHEDULE_INTERVAL_MS[brand.schedule as "weekly" | "daily"];
    await db
      .update(schema.brands)
      .set({ nextScanAt: new Date(now.getTime() + intervalMs), updatedAt: now })
      .where(eq(schema.brands.id, brand.id));
  }

  return due.length;
}
