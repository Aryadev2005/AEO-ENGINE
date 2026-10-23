import { describe, expect, it } from "vitest";
import { createInMemoryCostLedger } from "../src/engine/cost";
import { runScan } from "../src/engine/runner";

describe("runScan (mock mode, no API keys)", () => {
  it("runs every prompt against every requested engine and produces scores", async () => {
    const ledger = createInMemoryCostLedger();
    const output = await runScan(
      {
        brand: { name: "Velectico", city: "Kolkata", country: "India" },
        competitors: [{ id: "c1", name: "Northwind Solutions" }],
        prompts: [
          { id: "p1", text: "best IT services company in Kolkata" },
          { id: "p2", text: "Velectico alternatives" },
        ],
        engines: ["chatgpt", "gemini"],
      },
      ledger,
    );

    expect(output.results).toHaveLength(4);
    expect(output.skippedEngines).toEqual([]);
    expect(output.results.every((r) => !r.failed)).toBe(true);

    const engineLabels = new Set(output.scores.map((s) => s.engine));
    expect(engineLabels.has("chatgpt")).toBe(true);
    expect(engineLabels.has("gemini")).toBe(true);
    expect(engineLabels.has("all")).toBe(true);

    expect(output.totalCostUsd).toBe(0); // mock calls are free
    expect(ledger.entries()).toHaveLength(4);
  });

  it("never crashes the whole scan when a single call fails", async () => {
    const ledger = createInMemoryCostLedger();
    const output = await runScan(
      {
        brand: { name: "Velectico" },
        competitors: [],
        prompts: [{ id: "p1", text: "anything" }],
        engines: ["chatgpt"],
      },
      ledger,
    );
    expect(output.results).toHaveLength(1);
    expect(output.results[0].failed).toBe(false);
  });
});
