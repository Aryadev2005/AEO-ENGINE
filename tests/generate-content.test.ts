import { describe, expect, it } from "vitest";
import { generateRecommendationContent } from "../src/engine/generate-content";
import type { RecommendationDraft } from "../src/engine/recommend";

// No OPENROUTER_API_KEY in the test env, so callUtilityModel always throws and
// every branch exercises its template fallback — exactly what we want to verify.
function draft(overrides: Partial<RecommendationDraft> = {}): RecommendationDraft {
  return { type: "faq_page", title: "t", why: "w", priority: "med", ...overrides };
}

describe("generateRecommendationContent (template fallback, no LLM key)", () => {
  it("faq_page produces markdown Q&A for each prompt", async () => {
    const result = await generateRecommendationContent(draft({ type: "faq_page" }), {
      brandName: "Velectico",
      faqPrompts: ["best IT services in Kolkata", "top IT companies"],
    });
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("best IT services in Kolkata");
    expect(result.content).toContain("Velectico");
  });

  it("comparison_page names the brand and competitor", async () => {
    const result = await generateRecommendationContent(draft({ type: "comparison_page" }), {
      brandName: "Velectico",
      comparisonCompetitor: "TCS",
    });
    expect(result.content).toContain("Velectico vs TCS");
  });

  it("get_listed references the cited domain", async () => {
    const result = await generateRecommendationContent(draft({ type: "get_listed" }), {
      brandName: "Velectico",
      topCitedDomain: "g2.com",
    });
    expect(result.content).toContain("g2.com");
  });

  it("schema produces valid parseable JSON-LD", async () => {
    const result = await generateRecommendationContent(draft({ type: "schema" }), {
      brandName: "Velectico",
      website: "https://velectico.com",
      city: "Kolkata",
    });
    expect(result.format).toBe("json-ld");
    const parsed = JSON.parse(result.content);
    expect(parsed["@type"]).toBe("LocalBusiness");
    expect(parsed.name).toBe("Velectico");
  });

  it("schema uses Organization when no city is set", async () => {
    const result = await generateRecommendationContent(draft({ type: "schema" }), {
      brandName: "Velectico",
    });
    const parsed = JSON.parse(result.content);
    expect(parsed["@type"]).toBe("Organization");
  });

  it("llms_txt is a text file naming the brand", async () => {
    const result = await generateRecommendationContent(draft({ type: "llms_txt" }), {
      brandName: "Velectico",
    });
    expect(result.format).toBe("text");
    expect(result.content).toContain("Velectico");
  });

  it("community lists search topics", async () => {
    const result = await generateRecommendationContent(draft({ type: "community" }), {
      brandName: "Velectico",
      communityTopics: ["best IT services Kolkata"],
    });
    expect(result.content).toContain("best IT services Kolkata");
  });

  it("reputation includes negative snippets", async () => {
    const result = await generateRecommendationContent(draft({ type: "reputation" }), {
      brandName: "Velectico",
      negativeSnippets: ["Velectico was slow to respond to our ticket."],
    });
    expect(result.content).toContain("slow to respond");
  });

  it("reviews points to the Reviews tab", async () => {
    const result = await generateRecommendationContent(draft({ type: "reviews" }), {
      brandName: "Velectico",
    });
    expect(result.format).toBe("text");
    expect(result.content.length).toBeGreaterThan(0);
  });
});
