import { NextRequest, NextResponse } from "next/server";
import { claimNextJob, completeJob, failJob } from "@/db/jobs";
import { dispatchJob } from "@/db/job-runner";
import { enqueueDueScheduledScans } from "@/db/scheduler";

export const dynamic = "force-dynamic";
// Extends this function's timeout where the hosting plan allows it (e.g. Vercel
// Pro: up to 300s). Hobby plans cap lower — see README for tuning TIME_BUDGET_MS.
export const maxDuration = 60;

// Leaves headroom under the function timeout for the in-flight job to finish
// and the response to be written, rather than racing the platform's own cutoff.
const TIME_BUDGET_MS = 50_000;

/**
 * The serverless replacement for the standalone worker (spec §5/§8): on each
 * invocation, enqueues any due weekly/daily brand scans, then claims and runs
 * queued jobs until the time budget runs out or the queue empties. Call this
 * on a schedule — see vercel.json, or point any external scheduler at it with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const scheduledScans = await enqueueDueScheduledScans();

  const start = Date.now();
  let jobsProcessed = 0;
  let jobsFailed = 0;
  while (Date.now() - start < TIME_BUDGET_MS) {
    const job = await claimNextJob();
    if (!job) break;
    try {
      await dispatchJob(job);
      await completeJob(job.id);
    } catch (err) {
      jobsFailed++;
      await failJob(job.id, job.attempts, String(err));
    }
    jobsProcessed++;
  }

  return NextResponse.json({ scheduledScans, jobsProcessed, jobsFailed });
}
