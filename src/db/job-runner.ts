import type { ClaimedJob } from "./jobs";
import { processGenerateRecsJob } from "./recommend-service";
import { processScanJob } from "./scan-service";

/** Runs one already-claimed job. Throws on failure — callers decide how to record that. */
export async function dispatchJob(job: ClaimedJob): Promise<void> {
  if (job.type === "scan") {
    await processScanJob(job.payload.scanId as string);
  } else if (job.type === "generate_recs") {
    await processGenerateRecsJob(job.payload.scanId as string);
  } else {
    throw new Error(`Job type "${job.type}" has no handler yet`);
  }
}
