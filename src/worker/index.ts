import "../lib/load-env";
import cron from "node-cron";
import { claimNextJob, completeJob, failJob } from "../db/jobs";
import { dispatchJob } from "../db/job-runner";
import { enqueueDueScheduledScans } from "../db/scheduler";

const POLL_INTERVAL_MS = 3000;
let stopping = false;

async function processJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  console.log(`[worker] picked up job ${job.id} (${job.type}, attempt ${job.attempts + 1})`);
  try {
    await dispatchJob(job);
    await completeJob(job.id);
    console.log(`[worker] completed job ${job.id}`);
  } catch (err) {
    console.error(`[worker] job ${job.id} failed:`, err);
    await failJob(job.id, job.attempts, String(err));
  }
  return true;
}

async function pollLoop(): Promise<void> {
  while (!stopping) {
    const processed = await processJob();
    if (!processed) {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[worker] starting — polling for jobs every", POLL_INTERVAL_MS, "ms");

  cron.schedule("0 * * * *", () => {
    enqueueDueScheduledScans().catch((err) => console.error("[worker] schedule check failed:", err));
  });
  await enqueueDueScheduledScans();

  process.on("SIGINT", () => {
    console.log("\n[worker] shutting down...");
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  await pollLoop();
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
