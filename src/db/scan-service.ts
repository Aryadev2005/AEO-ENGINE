import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { BudgetExceededError, createInMemoryCostLedger, type LlmCallLog } from "../engine/cost";
import type { EngineId } from "../engine/providers/types";
import { runScan, type ScanOutput } from "../engine/runner";
import { getRemainingBudgetUsd } from "./budget";
import { createDbScanCache } from "./cache";
import { db, schema } from "./client";
import { enqueueJob } from "./jobs";

export async function enqueueScan(
  brandId: string,
  engines: EngineId[],
  trigger: "manual" | "schedule" | "checker" = "manual",
): Promise<string> {
  const scanId = randomUUID();
  await db.insert(schema.scans).values({ id: scanId, brandId, status: "queued", trigger, engines });
  await enqueueJob("scan", { scanId });
  return scanId;
}

interface PersistTimestamps {
  startedAt: Date;
  finishedAt: Date;
}

export async function persistScanOutput(
  scanId: string,
  brandId: string,
  workspaceId: string | null,
  output: ScanOutput,
  ledgerEntries: LlmCallLog[],
  timestamps: PersistTimestamps,
): Promise<void> {
  // Batched rather than one insert per row: over a networked Postgres connection
  // (Supabase, not a local file), a 40-result scan at one round-trip per row adds
  // up fast and eats into the serverless cron endpoint's time budget.
  if (output.results.length > 0) {
    const scanResultRows = output.results.map((r) => ({
      id: randomUUID(),
      scanId,
      promptId: r.promptId,
      engine: r.engine,
      model: r.model,
      answerText: r.answerText,
      latencyMs: r.latencyMs,
      costUsd: r.costUsd,
      brandMentioned: r.brandMentioned,
      brandPosition: r.brandPosition,
      brandSentiment: r.brandSentiment,
      brandContext: r.brandContext,
      entities: r.entities,
      suggestedCompetitors: r.suggestedCompetitors,
      failed: r.failed,
      error: r.error ?? null,
      createdAt: timestamps.finishedAt,
      updatedAt: timestamps.finishedAt,
    }));
    await db.insert(schema.scanResults).values(scanResultRows);

    const citationRows = output.results.flatMap((r, i) =>
      r.citations.map((c) => ({
        id: randomUUID(),
        scanResultId: scanResultRows[i].id,
        url: c.url,
        domain: c.domain,
        title: null,
        sourceType: c.sourceType,
        createdAt: timestamps.finishedAt,
        updatedAt: timestamps.finishedAt,
      })),
    );
    if (citationRows.length > 0) {
      await db.insert(schema.citations).values(citationRows);
    }
  }

  if (ledgerEntries.length > 0) {
    await db.insert(schema.llmCalls).values(
      ledgerEntries.map((l) => ({
        id: randomUUID(),
        workspaceId,
        purpose: l.purpose,
        engine: l.engine,
        model: l.model,
        inputTokens: l.inputTokens,
        outputTokens: l.outputTokens,
        costUsd: l.costUsd,
        latencyMs: l.latencyMs,
        ok: l.ok,
        error: l.error ?? null,
        createdAt: l.createdAt,
        updatedAt: l.createdAt,
      })),
    );
  }

  if (output.scores.length > 0) {
    await db.insert(schema.scores).values(
      output.scores.map((s) => ({
        id: randomUUID(),
        brandId,
        scanId,
        engine: s.engine,
        visibilityPct: s.visibilityPct,
        avgPosition: s.avgPosition,
        shareOfVoicePct: s.shareOfVoicePct,
        citationSharePct: s.citationSharePct,
        sentimentScore: s.sentimentScore,
        overallScore: s.overallScore,
        computedAt: timestamps.finishedAt,
        createdAt: timestamps.finishedAt,
        updatedAt: timestamps.finishedAt,
      })),
    );
  }
}

/** The worker's handler for a "scan" job: load from DB, run the engine, persist, update status. */
export async function processScanJob(scanId: string): Promise<void> {
  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!scan) throw new Error(`Scan ${scanId} not found`);

  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, scan.brandId));
  if (!brand) throw new Error(`Brand ${scan.brandId} not found`);

  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, brand.workspaceId));

  const competitorRows = await db
    .select()
    .from(schema.competitors)
    .where(eq(schema.competitors.brandId, brand.id));

  const promptRows = await db
    .select()
    .from(schema.prompts)
    .where(and(eq(schema.prompts.brandId, brand.id), eq(schema.prompts.isActive, true)));

  const now = new Date();
  if (promptRows.length === 0) {
    await db
      .update(schema.scans)
      .set({ status: "failed", error: "No active prompts to scan", finishedAt: now, updatedAt: now })
      .where(eq(schema.scans.id, scanId));
    return;
  }

  const startedAt = new Date();
  await db
    .update(schema.scans)
    .set({ status: "running", startedAt, updatedAt: startedAt })
    .where(eq(schema.scans.id, scanId));

  const ledger = createInMemoryCostLedger();

  try {
    const remainingBudget = workspace ? await getRemainingBudgetUsd(workspace.id) : undefined;

    const output = await runScan(
      {
        brand: {
          name: brand.name,
          aliases: brand.aliases,
          website: brand.website ?? undefined,
          city: brand.city ?? undefined,
          country: brand.country ?? undefined,
        },
        competitors: competitorRows.map((c) => ({
          id: c.id,
          name: c.name,
          aliases: c.aliases,
          website: c.website ?? undefined,
        })),
        prompts: promptRows.map((p) => ({ id: p.id, text: p.text, intent: p.intent })),
        engines: scan.engines as EngineId[],
        budgetUsd: remainingBudget,
        workspaceId: workspace?.id ?? null,
        cache: createDbScanCache(brand.id),
      },
      ledger,
    );

    const finishedAt = new Date();
    await persistScanOutput(scanId, brand.id, workspace?.id ?? null, output, ledger.entries(), {
      startedAt,
      finishedAt,
    });

    await db
      .update(schema.scans)
      .set({
        status: "done",
        finishedAt,
        estCostUsd: output.estimatedCostUsd,
        actualCostUsd: output.totalCostUsd,
        updatedAt: finishedAt,
      })
      .where(eq(schema.scans.id, scanId));

    await enqueueJob("generate_recs", { scanId });
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof BudgetExceededError ? err.message : String(err);
    await db
      .update(schema.scans)
      .set({ status: "failed", error: message, finishedAt, updatedAt: finishedAt })
      .where(eq(schema.scans.id, scanId));
    throw err;
  }
}
