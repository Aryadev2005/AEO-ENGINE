import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "./client";

/** Remaining spend this calendar month against the workspace's monthly budget. */
export async function getRemainingBudgetUsd(workspaceId: string): Promise<number> {
  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  if (!workspace) return 0;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const rows = await db
    .select({ costUsd: schema.llmCalls.costUsd })
    .from(schema.llmCalls)
    .where(and(eq(schema.llmCalls.workspaceId, workspaceId), gte(schema.llmCalls.createdAt, startOfMonth)));

  const spent = rows.reduce((sum, r) => sum + r.costUsd, 0);
  return Math.max(0, workspace.monthlyBudgetUsd - spent);
}
