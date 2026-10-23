import type { EngineId, Provider, ProviderRequest, ProviderResponse } from "./types";

// Simple deterministic string hash so the same prompt always produces the same fake answer.
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const FAKE_COMPETITORS = [
  "Northwind Solutions",
  "BrightPath Co",
  "Summit & Co",
  "Lakeside Partners",
  "Clearwater Group",
];

const FAKE_DOMAINS = [
  "g2.com",
  "practo.com",
  "reddit.com",
  "yelp.com",
  "wikipedia.org",
];

export interface MockOptions {
  brandName: string;
  competitorNames?: string[];
}

/**
 * Deterministic fake engine for dev/demo with zero API keys. The brand is
 * mentioned (or not) and ranked based on a hash of the prompt text, so the
 * same prompt always reproduces the same fake result across runs.
 */
export function createMockProvider(opts: MockOptions, engine: EngineId = "mock"): Provider {
  return {
    id: engine,
    isConfigured(): boolean {
      return true;
    },
    async run(req: ProviderRequest): Promise<ProviderResponse> {
      const start = Date.now();
      const h = hash(req.prompt + opts.brandName);
      const includesBrand = h % 10 < 7; // ~70% mention rate
      const brandPosition = includesBrand ? (h % 5) + 1 : null;

      const pool = (
        opts.competitorNames && opts.competitorNames.length > 0
          ? opts.competitorNames
          : FAKE_COMPETITORS
      ).slice(0, 4);

      const entities: { name: string; position: number }[] = [];
      let slot = 1;
      for (let i = 0; i < pool.length; i++) {
        if (includesBrand && slot === brandPosition) {
          entities.push({ name: opts.brandName, position: slot });
          slot++;
        }
        entities.push({ name: pool[i], position: slot });
        slot++;
      }
      if (includesBrand && !entities.some((e) => e.name === opts.brandName)) {
        entities.push({ name: opts.brandName, position: slot++ });
      }
      entities.sort((a, b) => a.position - b.position);

      const listText = entities
        .map((e, i) => `${i + 1}. ${e.name} — a solid option for this request.`)
        .join("\n");

      const text = `Based on what's generally recommended, here are some options:\n${listText}\n\nSources are linked below.`;

      const numCitations = 1 + (h % 3);
      const citations = Array.from({ length: numCitations }, (_, i) => {
        const domain = FAKE_DOMAINS[(h + i) % FAKE_DOMAINS.length];
        return {
          url: `https://${domain}/mock-result-${(h + i) % 1000}`,
          title: `Mock source ${i + 1} on ${domain}`,
        };
      });

      const inputTokens = Math.round(req.prompt.length / 4) + 50;
      const outputTokens = Math.round(text.length / 4);

      return {
        engine,
        model: `mock-${engine}-v1`,
        text,
        citations,
        usage: { inputTokens, outputTokens, costUsd: 0 },
        latencyMs: Date.now() - start,
        raw: { entities },
      };
    },
  };
}
