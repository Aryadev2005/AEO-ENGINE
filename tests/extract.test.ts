import { describe, expect, it, vi } from "vitest";
import {
  extractPassA,
  extractPassB,
  findSuggestedCompetitors,
} from "../src/engine/extract";

describe("extractPassA", () => {
  it("finds the brand and ranks entities by numbered list order", () => {
    const text = `Here are some good options:
1. Northwind Solutions is solid for small teams.
2. Velectico has strong delivery track record.
3. Summit & Co is also worth a look.`;

    const result = extractPassA({
      text,
      brandName: "Velectico",
      competitors: [
        { id: "c1", name: "Northwind Solutions" },
        { id: "c2", name: "Summit & Co" },
      ],
      providerCitations: [],
    });

    expect(result.brandMentioned).toBe(true);
    expect(result.brandPosition).toBe(2);
    expect(result.entities.map((e) => e.name)).toEqual([
      "Northwind Solutions",
      "Velectico",
      "Summit & Co",
    ]);
    expect(result.hasListFormat).toBe(true);
  });

  it("falls back to first-appearance order without a list", () => {
    const text = "You might consider Summit & Co, or Velectico if you want more support.";
    const result = extractPassA({
      text,
      brandName: "Velectico",
      competitors: [{ id: "c1", name: "Summit & Co" }],
      providerCitations: [],
    });
    expect(result.brandPosition).toBe(2);
    expect(result.hasListFormat).toBe(false);
  });

  it("is not mentioned when the brand doesn't appear", () => {
    const result = extractPassA({
      text: "Northwind Solutions is a great pick.",
      brandName: "Velectico",
      competitors: [{ id: "c1", name: "Northwind Solutions" }],
      providerCitations: [],
    });
    expect(result.brandMentioned).toBe(false);
    expect(result.brandPosition).toBeNull();
    expect(result.entities).toHaveLength(1);
  });

  it("tolerates punctuation and suffix variants", () => {
    const result = extractPassA({
      text: "Velectico Pvt Ltd is a reasonable choice, and so is Summit and Co.",
      brandName: "Velectico",
      competitors: [{ id: "c1", name: "Summit & Co" }],
      providerCitations: [],
    });
    expect(result.brandMentioned).toBe(true);
    expect(result.entities.some((e) => e.name === "Summit & Co")).toBe(true);
  });

  it("dedupes citations from provider citations and inline URLs", () => {
    const text = "See https://g2.com/x for more, and https://g2.com/x/ again.";
    const result = extractPassA({
      text,
      brandName: "Velectico",
      competitors: [],
      providerCitations: [{ url: "https://g2.com/x" }, { url: "https://practo.com/y" }],
    });
    const urls = result.citations.map((c) => c.url);
    expect(result.citations).toHaveLength(2);
    expect(urls).toContain("https://g2.com/x");
    expect(urls).toContain("https://practo.com/y");
  });
});

describe("extractPassB", () => {
  it("parses a valid JSON response", async () => {
    const callUtilityModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        recommended_entities: [{ name: "Velectico", position: 1 }],
        brand_sentiment: "positive",
        brand_context: "Velectico is great.",
      }),
    );
    const result = await extractPassB({
      text: "Velectico is great.",
      brandName: "Velectico",
      competitorNames: [],
      callUtilityModel,
    });
    expect(result?.brand_sentiment).toBe("positive");
    expect(callUtilityModel).toHaveBeenCalledTimes(1);
  });

  it("strips markdown code fences before parsing", async () => {
    const callUtilityModel = vi.fn().mockResolvedValue(
      "```json\n" +
        JSON.stringify({
          recommended_entities: [],
          brand_sentiment: null,
          brand_context: null,
        }) +
        "\n```",
    );
    const result = await extractPassB({
      text: "no mentions here",
      brandName: "Velectico",
      competitorNames: [],
      callUtilityModel,
    });
    expect(result?.brand_sentiment).toBeNull();
  });

  it("retries once on invalid JSON, then degrades to null", async () => {
    const callUtilityModel = vi.fn().mockResolvedValue("not json at all");
    const result = await extractPassB({
      text: "whatever",
      brandName: "Velectico",
      competitorNames: [],
      callUtilityModel,
    });
    expect(result).toBeNull();
    expect(callUtilityModel).toHaveBeenCalledTimes(2);
  });

  it("degrades to null when the model call throws", async () => {
    const callUtilityModel = vi.fn().mockRejectedValue(new Error("no key configured"));
    const result = await extractPassB({
      text: "whatever",
      brandName: "Velectico",
      competitorNames: [],
      callUtilityModel,
    });
    expect(result).toBeNull();
  });
});

describe("findSuggestedCompetitors", () => {
  it("excludes the brand and already-tracked competitors", () => {
    const suggested = findSuggestedCompetitors(
      [{ name: "Velectico" }, { name: "Northwind Solutions" }, { name: "Acme Devs" }],
      "Velectico",
      ["Northwind Solutions"],
    );
    expect(suggested).toEqual(["Acme Devs"]);
  });
});
