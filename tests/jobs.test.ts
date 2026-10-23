import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schema } from "../src/db/client";
import { claimNextJob, completeJob, enqueueJob, failJob } from "../src/db/jobs";

beforeEach(async () => {
  await db.delete(schema.jobs);
});

describe("job queue", () => {
  it("claims a queued job and marks it running", async () => {
    const id = await enqueueJob("scan", { scanId: "abc" });
    const job = await claimNextJob();
    expect(job?.id).toBe(id);
    expect(job?.type).toBe("scan");
    expect(job?.payload).toEqual({ scanId: "abc" });

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row.status).toBe("running");
  });

  it("never returns the same job to two concurrent claims", async () => {
    await enqueueJob("scan", { scanId: "only-one" });
    const [first, second] = await Promise.all([claimNextJob(), claimNextJob()]);
    const claimed = [first, second].filter((j) => j !== null);
    expect(claimed).toHaveLength(1);
  });

  it("returns null when nothing is due yet", async () => {
    await enqueueJob("scan", { scanId: "future" }, new Date(Date.now() + 60_000));
    const job = await claimNextJob();
    expect(job).toBeNull();
  });

  it("completeJob marks status done", async () => {
    await enqueueJob("scan", { scanId: "x" });
    const job = await claimNextJob();
    await completeJob(job!.id);

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job!.id));
    expect(row.status).toBe("done");
  });

  it("failJob requeues with backoff below max attempts", async () => {
    const id = await enqueueJob("scan", { scanId: "retry-me" });
    const job = await claimNextJob();
    await failJob(job!.id, job!.attempts, "boom");

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("boom");
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
  });

  it("failJob marks failed once attempts reach the max", async () => {
    const id = await enqueueJob("scan", { scanId: "doomed" });

    for (const errorMessage of ["err1", "err2", "err3"]) {
      // force due-now so the test doesn't have to wait out the real backoff window
      await db.update(schema.jobs).set({ runAfter: new Date() }).where(eq(schema.jobs.id, id));
      const job = await claimNextJob();
      await failJob(job!.id, job!.attempts, errorMessage);
    }

    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(3);
  });
});
