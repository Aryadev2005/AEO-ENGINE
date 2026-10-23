import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { SCAN_RESULT_CACHE_HOURS } from "../engine/config";
import type { EngineId, ProviderResponse } from "../engine/providers/types";
import type { ScanCacheAdapter } from "../engine/runner";
import { db, schema } from "./client";

/** Backs ScanCacheAdapter with the scan_results table itself — no separate cache store needed. */
export function createDbScanCache(brandId: string): ScanCacheAdapter {
  return {
    async get({ promptId, engine }: { promptId: string; engine: EngineId }): Promise<ProviderResponse | null> {
      const cutoff = new Date(Date.now() - SCAN_RESULT_CACHE_HOURS * 60 * 60 * 1000);

      const recentScans = await db
        .select({ id: schema.scans.id })
        .from(schema.scans)
        .where(and(eq(schema.scans.brandId, brandId), gte(schema.scans.createdAt, cutoff)));
      if (recentScans.length === 0) return null;
      const scanIds = recentScans.map((s) => s.id);

      const rows = await db
        .select()
        .from(schema.scanResults)
        .where(
          and(
            inArray(schema.scanResults.scanId, scanIds),
            eq(schema.scanResults.promptId, promptId),
            eq(schema.scanResults.engine, engine),
            eq(schema.scanResults.failed, false),
            gte(schema.scanResults.createdAt, cutoff),
          ),
        )
        .orderBy(desc(schema.scanResults.createdAt))
        .limit(1);
      const row = rows[0];
      if (!row) return null;

      const citationRows = await db
        .select()
        .from(schema.citations)
        .where(eq(schema.citations.scanResultId, row.id));

      return {
        engine,
        model: row.model,
        text: row.answerText,
        citations: citationRows.map((c) => ({ url: c.url, title: c.title ?? undefined })),
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        latencyMs: 0,
        raw: { cachedFromScanResultId: row.id },
      };
    },
  };
}
