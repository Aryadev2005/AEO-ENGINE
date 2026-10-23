import type { EngineId } from "./providers/types";

export type CallPurpose = "scan" | "extract" | "generate" | "checker";

export interface LlmCallLog {
  workspaceId: string | null;
  purpose: CallPurpose;
  engine: EngineId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
  createdAt: Date;
}

export interface CostLedger {
  logCall(entry: Omit<LlmCallLog, "createdAt">): void;
  totalUsd(): number;
  entries(): LlmCallLog[];
}

/**
 * In-memory ledger for M1 (CLI mode, no DB yet). The DB-backed worker in M2
 * persists the same shape to the `llm_calls` table via this same interface.
 */
export function createInMemoryCostLedger(): CostLedger {
  const logs: LlmCallLog[] = [];
  return {
    logCall(entry) {
      logs.push({ ...entry, createdAt: new Date() });
    },
    totalUsd() {
      return logs.reduce((sum, l) => sum + l.costUsd, 0);
    },
    entries() {
      return logs;
    },
  };
}

export class BudgetExceededError extends Error {
  constructor(
    public estimatedUsd: number,
    public remainingUsd: number,
  ) {
    super(
      `Estimated scan cost $${estimatedUsd.toFixed(4)} exceeds remaining budget $${remainingUsd.toFixed(4)}`,
    );
    this.name = "BudgetExceededError";
  }
}

export function assertWithinBudget(estimatedUsd: number, remainingUsd: number): void {
  if (estimatedUsd > remainingUsd) {
    throw new BudgetExceededError(estimatedUsd, remainingUsd);
  }
}
