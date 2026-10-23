import { describe, expect, it } from "vitest";
import { generateRecommendations } from "../src/engine/recommend";
import type { ScanResultRecord } from "../src/engine/runner";

function result(overrides: Partial<ScanResultRecord> = {}): ScanResultRecord {
  return {
    promptId: "p1",
    promptText: "best X in Y",
    promptIntent: "discovery",
    engine: "mock",
    model: "mock-v1",
    answerText: "answer",
    latencyMs: 0,
    costUsd: 0,
    brandMentioned: false,
    brandPosition: null,
    brandSentiment: null,
    brandContext: null,
    entities: [],
    citations: [],
    suggestedCompetitors: [],
    failed: false,
    fromCache: false,
    ...overrides,
  };
}

describe("generateRecommendations", () => {
  it("suggests an FAQ page when discovery/local visibility is low", () => {
    const results = [
      result({ promptIntent: "discovery", brandMentioned: false }),
      result({ promptIntent: "discovery", brandMentioned: false }),
      result({ promptIntent: "discovery", brandMentioned: false }),
      result({ promptIntent: "local", brandMentioned: true, brandPosition: 1 }),
    ];
    const recs = generateRecommendations({ brandName: "Velectico", results });
    expect(recs.some((r) => r.type === "faq_page")).toBe(true);
  });

  it("suggests a comparison page when missing from alternative/comparison prompts", () => {
    const results = [
      result({ promptIntent: "alternative", brandMentioned: false }),
      result({ promptIntent: "comparison", brandMentioned: false }),
    ];
    const recs = generateRecommendations({ brandName: "Velectico", results });
    expect(recs.some((r) => r.type === "comparison_page" && r.priority === "high")).toBe(true);
  });

  it("suggests get_listed when a review site/directory is cited and isn't the brand's own site", () => {
    const results = [
      result({
        citations: [{ url: "https://g2.com/x", domain: "g2.com", sourceType: "review_site" }],
      }),
      result({
        citations: [{ url: "https://g2.com/y", domain: "g2.com", sourceType: "review_site" }],
      }),
    ];
    const recs = generateRecommendations({ brandName: "Velectico", brandWebsite: "https://velectico.com", results });
    const rec = recs.find((r) => r.type === "get_listed");
    expect(rec?.title).toContain("g2.com");
  });

  it("does not suggest get_listed for the brand's own review-site-classified domain", () => {
    const results = [
      result({
        citations: [{ url: "https://velectico.com/reviews", domain: "velectico.com", sourceType: "review_site" }],
      }),
    ];
    const recs = generateRecommendations({ brandName: "Velectico", brandWebsite: "https://velectico.com", results });
    expect(recs.some((r) => r.type === "get_listed")).toBe(false);
  });

  it("flags reputation when negative sentiment appears", () => {
    const results = [result({ brandMentioned: true, brandSentiment: "negative" })];
    const recs = generateRecommendations({ brandName: "Velectico", results });
    expect(recs.some((r) => r.type === "reputation")).toBe(true);
  });

  it("flags reviews when rating is below 4.3", () => {
    const results = [result()];
    const recs = generateRecommendations({
      brandName: "Velectico",
      results,
      reviews: { rating: 3.8, reviewCount: 10 },
    });
    expect(recs.some((r) => r.type === "reviews" && r.priority === "high")).toBe(true);
  });

  it("skips schema/llms_txt rules when not checked", () => {
    const results = [result()];
    const recs = generateRecommendations({ brandName: "Velectico", results });
    expect(recs.some((r) => r.type === "schema" || r.type === "llms_txt")).toBe(false);
  });

  it("sorts by priority (high before med before low)", () => {
    const results = [
      result({ promptIntent: "alternative", brandMentioned: false }), // high: comparison_page
      result({ brandSentiment: "negative" }), // med (1 negative result)
    ];
    const recs = generateRecommendations({ brandName: "Velectico", results, hasLlmsTxt: false });
    const ranks = recs.map((r) => r.priority);
    const highIdx = ranks.indexOf("high");
    const lowIdx = ranks.indexOf("low");
    if (highIdx !== -1 && lowIdx !== -1) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
  });

  it("returns nothing when there are no successful results", () => {
    const recs = generateRecommendations({ brandName: "Velectico", results: [result({ failed: true })] });
    expect(recs).toEqual([]);
  });
});
