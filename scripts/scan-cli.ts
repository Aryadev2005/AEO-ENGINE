#!/usr/bin/env tsx
import "../src/lib/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInMemoryCostLedger } from "../src/engine/cost";
import { ALL_ENGINES } from "../src/engine/providers";
import type { EngineId } from "../src/engine/providers/types";
import { parsePromptsFile } from "../src/engine/prompts";
import { runScan, type CompetitorRunnerInput } from "../src/engine/runner";
import { BudgetExceededError } from "../src/engine/cost";

interface Args {
  brand: string;
  city?: string;
  country: string;
  website?: string;
  prompts: string;
  engines: EngineId[];
  competitors: CompetitorRunnerInput[];
  budget?: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const brand = get("--brand");
  const prompts = get("--prompts");
  if (!brand || !prompts) {
    console.error(
      'Usage: npm run scan:cli -- --brand "Name" --city "City" [--country "Country"] [--website "https://..."] --prompts prompts.txt [--engines chatgpt,gemini] [--competitors "A|a.com,B|b.com"] [--budget 1.00]',
    );
    process.exit(1);
  }

  const enginesArg = get("--engines");
  const engines = enginesArg
    ? (enginesArg.split(",").map((e) => e.trim()) as EngineId[])
    : ALL_ENGINES;

  const competitorsArg = get("--competitors");
  const competitors: CompetitorRunnerInput[] = competitorsArg
    ? competitorsArg.split(",").map((entry, i) => {
        const [name, website] = entry.split("|").map((s) => s.trim());
        return { id: `c${i + 1}`, name, website: website || undefined };
      })
    : [];

  const budgetArg = get("--budget");

  return {
    brand,
    city: get("--city"),
    country: get("--country") ?? "India",
    website: get("--website"),
    prompts,
    engines,
    competitors,
    budget: budgetArg ? Number(budgetArg) : undefined,
  };
}

function bar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const promptsContent = readFileSync(resolve(args.prompts), "utf-8");
  const promptList = parsePromptsFile(promptsContent);

  if (promptList.length === 0) {
    console.error(`No prompts found in ${args.prompts}`);
    process.exit(1);
  }

  console.log(`\nScanning "${args.brand}" across ${args.engines.join(", ")}`);
  console.log(`${promptList.length} prompts × ${args.engines.length} engines\n`);

  const ledger = createInMemoryCostLedger();

  try {
    const output = await runScan(
      {
        brand: {
          name: args.brand,
          city: args.city,
          country: args.country,
          website: args.website,
        },
        competitors: args.competitors,
        prompts: promptList,
        engines: args.engines,
        budgetUsd: args.budget,
      },
      ledger,
    );

    if (output.skippedEngines.length > 0) {
      console.log(`Not configured (skipped): ${output.skippedEngines.join(", ")}\n`);
    }

    console.log("=== Scores ===");
    for (const s of output.scores) {
      const label = s.engine === "all" ? "ALL ENGINES" : s.engine.toUpperCase();
      console.log(
        `${label.padEnd(12)} overall ${String(s.overallScore).padStart(5)}  ${bar(s.overallScore)}  ` +
          `visibility ${s.visibilityPct}%  avgPos ${s.avgPosition ?? "—"}  SoV ${s.shareOfVoicePct}%  ` +
          `citations ${s.citationSharePct}%  sentiment ${s.sentimentScore ?? "—"}`,
      );
    }

    console.log("\n=== Prompt × Engine ===");
    for (const r of output.results) {
      const mark = r.failed ? "✗ FAILED" : r.brandMentioned ? `✅ #${r.brandPosition}` : "❌";
      const sentiment = r.brandSentiment === "negative" ? " ⚠" : "";
      console.log(`[${r.engine.padEnd(10)}] ${mark}${sentiment}  "${r.promptText}"`);
      if (r.failed) console.log(`    error: ${r.error}`);
      if (r.suggestedCompetitors.length > 0) {
        console.log(`    suggested competitors: ${r.suggestedCompetitors.join(", ")}`);
      }
    }

    const citedDomains = new Map<string, number>();
    for (const r of output.results) {
      for (const c of r.citations) {
        citedDomains.set(c.domain, (citedDomains.get(c.domain) ?? 0) + 1);
      }
    }
    if (citedDomains.size > 0) {
      console.log("\n=== Top cited sources ===");
      Array.from(citedDomains.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([domain, count]) => console.log(`  ${String(count).padStart(3)}x  ${domain}`));
    }

    console.log(
      `\nEstimated cost: $${output.estimatedCostUsd.toFixed(4)}  |  Actual cost: $${output.totalCostUsd.toFixed(4)}`,
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      console.error(`\nBudget exceeded: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
