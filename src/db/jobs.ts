import { randomUUID } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { db, schema } from "./client";

export type JobType = "scan" | "generate_recs" | "fetch_reviews";

const MAX_ATTEMPTS = 3;

export interface ClaimedJob {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  runAfter: Date = new Date(),
): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.jobs).values({ id, type, payload, status: "queued", runAfter });
  return id;
}

/**
 * Atomically claims the oldest due queued job: select a candidate, then
 * update it with a WHERE guard on its still being "queued" so two worker
 * loops polling at once can never both pick up the same job.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, "queued"), lte(schema.jobs.runAfter, now)))
    .orderBy(asc(schema.jobs.runAfter))
    .limit(1);
  const candidate = candidates[0];
  if (!candidate) return null;

  const claimedAt = new Date();
  const claimed = await db
    .update(schema.jobs)
    .set({ status: "running", lockedAt: claimedAt, updatedAt: claimedAt })
    .where(and(eq(schema.jobs.id, candidate.id), eq(schema.jobs.status, "queued")))
    .returning();

  const job = claimed[0];
  if (!job) return null; // another worker claimed it between our select and update

  return {
    id: job.id,
    type: job.type as JobType,
    payload: job.payload as Record<string, unknown>,
    attempts: job.attempts,
  };
}

export async function completeJob(id: string): Promise<void> {
  await db
    .update(schema.jobs)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(schema.jobs.id, id));
}

/** Requeues with exponential backoff until MAX_ATTEMPTS, then marks failed for good. */
export async function failJob(id: string, attempts: number, error: string): Promise<void> {
  const nextAttempts = attempts + 1;
  const now = new Date();
  if (nextAttempts >= MAX_ATTEMPTS) {
    await db
      .update(schema.jobs)
      .set({ status: "failed", attempts: nextAttempts, lastError: error, updatedAt: now })
      .where(eq(schema.jobs.id, id));
    return;
  }
  const backoffMs = 2 ** nextAttempts * 30_000; // 1m, 2m, 4m...
  await db
    .update(schema.jobs)
    .set({
      status: "queued",
      attempts: nextAttempts,
      lastError: error,
      runAfter: new Date(now.getTime() + backoffMs),
      lockedAt: null,
      updatedAt: now,
    })
    .where(eq(schema.jobs.id, id));
}
