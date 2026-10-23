import { describe, expect, it } from "vitest";
import { computeScore, computeScoresByEngine, type ScoreInputResult } from "../src/engine/score";
import { positionScore } from "../src/engine/config";

function result(overrides: Partial<ScoreInputResult> = {}): ScoreInputResult {
  return {
    engine: "mock",
    brandMentioned: false,
    brandPosition: null,
    brandSentiment: null,
    entities: [],
    citationDomains: [],
    ...overrides,
  };
}

describe("positionScore", () => {
  it("is 100 at position 1 and decays to 0 by position 10", () => {
    expect(positionScore(1)).toBe(100);
    expect(positionScore(10)).toBe(0);
    expect(positionScore(null)).toBe(0);
  });
});

describe("computeScore", () => {
  it("returns zeros for an empty result set", () => {
    const s = computeScore("mock", []);
    expect(s.visibilityPct).toBe(0);
    expect(s.avgPosition).toBeNull();
    expect(s.shareOfVoicePct).toBe(0);
    expect(s.citationSharePct).toBe(0);
    expect(s.sentimentScore).toBeNull();
    expect(s.overallScore).toBe(0);
  });

  it("computes visibility as mentioned/total", () => {
    const s = computeScore("mock", [
      result({ brandMentioned: true, brandPosition: 1 }),
      result({ brandMentioned: false }),
    ]);
    expect(s.visibilityPct).toBe(50);
  });

  it("computes avg position only over mentioned results", () => {
    const s = computeScore("mock", [
      result({ brandMentioned: true, brandPosition: 1 }),
      result({ brandMentioned: true, brandPosition: 3 }),
      result({ brandMentioned: false }),
    ]);
    expect(s.avgPosition).toBe(2);
  });

  it("computes share of voice from brand vs competitor entity counts", () => {
    const s = computeScore("mock", [
      result({
        brandMentioned: true,
        brandPosition: 1,
        entities: [{ name: "Comp A", position: 2, isBrand: false, competitorId: "c1" }],
      }),
    ]);
    // 1 brand mention vs 1 competitor mention => 50%
    expect(s.shareOfVoicePct).toBe(50);
  });

  it("computes citation share against the brand domain", () => {
    const s = computeScore(
      "mock",
      [
        result({ citationDomains: ["velectico.com", "g2.com"] }),
        result({ citationDomains: ["practo.com"] }),
      ],
      "velectico.com",
    );
    expect(s.citationSharePct).toBe(round(1 / 3));
  });

  it("computes sentiment score as (positive - negative) / mentioned", () => {
    const s = computeScore("mock", [
      result({ brandMentioned: true, brandPosition: 1, brandSentiment: "positive" }),
      result({ brandMentioned: true, brandPosition: 1, brandSentiment: "negative" }),
      result({ brandMentioned: true, brandPosition: 1, brandSentiment: "neutral" }),
    ]);
    expect(s.sentimentScore).toBe(0);
  });

  function round(n: number): number {
    return Math.round(n * 100 * 100) / 100;
  }
});

describe("computeScoresByEngine", () => {
  it("groups by engine and also returns an 'all' aggregate", () => {
    const scores = computeScoresByEngine([
      result({ engine: "chatgpt", brandMentioned: true, brandPosition: 1 }),
      result({ engine: "gemini", brandMentioned: false }),
    ]);
    const engines = scores.map((s) => s.engine);
    expect(engines).toContain("chatgpt");
    expect(engines).toContain("gemini");
    expect(engines).toContain("all");
    expect(scores).toHaveLength(3);
  });
});
