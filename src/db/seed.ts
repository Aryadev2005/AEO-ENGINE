import "../lib/load-env";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifySource } from "../engine/classify-source";
import { extractPassA, type EntityMatch } from "../engine/extract";
import { parsePromptsFile } from "../engine/prompts";
import { createMockProvider } from "../engine/providers/mock";
import { ALL_ENGINES } from "../engine/providers";
import type { EngineId } from "../engine/providers/types";
import { computeScoresByEngine, type ScoreInputResult } from "../engine/score";
import { db, schema } from "./client";
import { persistScanOutput } from "./scan-service";

const DEMO_COMPETITORS = [
  { name: "Northwind Solutions", website: undefined },
  { name: "BrightPath Co", website: undefined },
  { name: "Summit & Co", website: undefined },
];

/**
 * Builds one scan's worth of results entirely from the mock provider — never
 * touches buildProviders/runScan, so seeding is free and deterministic
 * regardless of whatever real API keys are set in .env.
 */
async function simulateScan(opts: {
  brandName: string;
  brandWebsite?: string;
  competitors: { id: string; name: string; website?: string }[];
  prompts: { id: string; text: string; intent: "discovery" | "comparison" | "alternative" | "review" | "local" }[];
  engines: EngineId[];
  location: string;
}) {
  const mock = createMockProvider({
    brandName: opts.brandName,
    competitorNames: opts.competitors.map((c) => c.name),
  });

  const results = [];
  for (const prompt of opts.prompts) {
    for (const engine of opts.engines) {
      const response = await mock.run({ prompt: prompt.text, location: opts.location, webSearch: true });
      const passA = extractPassA({
        text: response.text,
        brandName: opts.brandName,
        competitors: opts.competitors,
        providerCitations: response.citations,
      });
      const citations = passA.citations.map((c) => ({
        ...c,
        sourceType: classifySource(c.url, {
          brandDomain: opts.brandWebsite,
          competitorDomains: opts.competitors.map((c) => c.website).filter(Boolean) as string[],
        }),
      }));
      // Deterministic pseudo-sentiment for nicer demo variety (no real LLM call in seed data).
      const brandSentiment =
        passA.brandPosition !== null && passA.brandPosition <= 2
          ? ("positive" as const)
          : passA.brandMentioned
            ? ("neutral" as const)
            : null;

      results.push({
        promptId: prompt.id,
        promptText: prompt.text,
        promptIntent: prompt.intent,
        engine: engine, // relabel the mock response to the engine we're simulating
        model: `mock-${engine}-v1`,
        answerText: response.text,
        latencyMs: response.latencyMs,
        costUsd: 0,
        brandMentioned: passA.brandMentioned,
        brandPosition: passA.brandPosition,
        brandSentiment,
        brandContext: null,
        entities: passA.entities as EntityMatch[],
        citations,
        suggestedCompetitors: [],
        failed: false,
        error: undefined,
        fromCache: false,
      });
    }
  }

  const scoreInputs: ScoreInputResult[] = results.map((r) => ({
    engine: r.engine,
    brandMentioned: r.brandMentioned,
    brandPosition: r.brandPosition,
    brandSentiment: r.brandSentiment,
    entities: r.entities,
    citationDomains: r.citations.map((c) => c.domain),
  }));
  const scores = computeScoresByEngine(scoreInputs, opts.brandWebsite);

  return { results, scores, totalCostUsd: 0, estimatedCostUsd: 0, skippedEngines: [] };
}

async function main() {
  console.log("Seeding demo workspace...");

  const userId = randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email: "demo@aeo-engine.local",
    name: "Demo User",
  });

  const workspaceId = randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: "Velectico Demo",
    plan: "starter",
    monthlyBudgetUsd: 5,
    country: "IN",
  });

  await db.insert(schema.memberships).values({
    id: randomUUID(),
    userId,
    workspaceId,
    role: "owner",
  });

  const brandId = randomUUID();
  await db.insert(schema.brands).values({
    id: brandId,
    workspaceId,
    name: "Velectico",
    aliases: ["Velectico IT Services", "Velectico Pvt Ltd"],
    website: "https://velectico.com",
    category: "IT services",
    city: "Kolkata",
    country: "India",
    description: "IT services and custom software development company based in Kolkata, India.",
    schedule: "weekly",
  });

  const competitorRows = DEMO_COMPETITORS.map((c) => ({
    id: randomUUID(),
    brandId,
    name: c.name,
    aliases: [] as string[],
    website: c.website ?? null,
  }));
  await db.insert(schema.competitors).values(competitorRows);

  const promptsContent = readFileSync(
    resolve(__dirname, "../../data/prompts.sample.txt"),
    "utf-8",
  );
  const parsedPrompts = parsePromptsFile(promptsContent);
  const promptRows = parsedPrompts.map((p) => ({
    id: randomUUID(),
    brandId,
    text: p.text,
    intent: p.intent ?? "discovery",
    isActive: true,
    source: "generated" as const,
  }));
  await db.insert(schema.prompts).values(promptRows);

  const simOpts = {
    brandName: "Velectico",
    brandWebsite: "https://velectico.com",
    competitors: competitorRows.map((c) => ({ id: c.id, name: c.name, website: c.website ?? undefined })),
    prompts: promptRows.map((p) => ({ id: p.id, text: p.text, intent: p.intent })),
    engines: ALL_ENGINES,
    location: "Kolkata, India",
  };

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const scan1Id = randomUUID();
  await db.insert(schema.scans).values({
    id: scan1Id,
    brandId,
    status: "done",
    trigger: "manual",
    engines: ALL_ENGINES,
    startedAt: oneWeekAgo,
    finishedAt: oneWeekAgo,
    estCostUsd: 0,
    actualCostUsd: 0,
    createdAt: oneWeekAgo,
    updatedAt: oneWeekAgo,
  });
  const output1 = await simulateScan(simOpts);
  await persistScanOutput(scan1Id, brandId, workspaceId, output1, [], {
    startedAt: oneWeekAgo,
    finishedAt: oneWeekAgo,
  });

  const now = new Date();
  const scan2Id = randomUUID();
  await db.insert(schema.scans).values({
    id: scan2Id,
    brandId,
    status: "done",
    trigger: "manual",
    engines: ALL_ENGINES,
    startedAt: now,
    finishedAt: now,
    estCostUsd: 0,
    actualCostUsd: 0,
    createdAt: now,
    updatedAt: now,
  });
  const output2 = await simulateScan(simOpts);
  await persistScanOutput(scan2Id, brandId, workspaceId, output2, [], {
    startedAt: now,
    finishedAt: now,
  });

  console.log(`Seeded workspace ${workspaceId} with brand ${brandId} and 2 scans (a week apart).`);
  console.log("Demo user: demo@aeo-engine.local");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
