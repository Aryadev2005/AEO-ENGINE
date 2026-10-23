import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "../db/client";

export async function getWorkspace(workspaceId: string) {
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  return workspace ?? null;
}

export async function updateWorkspace(
  workspaceId: string,
  patch: { name?: string; monthlyBudgetUsd?: number },
): Promise<void> {
  await db
    .update(schema.workspaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.workspaces.id, workspaceId));
}

export async function listMembers(workspaceId: string) {
  const rows = await db
    .select({ role: schema.memberships.role, email: schema.users.email, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.workspaceId, workspaceId));
  return rows.map((r) => ({ role: r.role, email: r.email ?? "unknown", name: r.name }));
}

export interface UsageRow {
  purpose: string;
  engine: string;
  costUsd: number;
  calls: number;
}

/** This-month LLM spend, broken down by purpose and engine. */
export async function getUsageSummary(workspaceId: string): Promise<UsageRow[]> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(schema.llmCalls)
    .where(and(eq(schema.llmCalls.workspaceId, workspaceId), gte(schema.llmCalls.createdAt, startOfMonth)));

  const grouped = new Map<string, UsageRow>();
  for (const row of rows) {
    const key = `${row.purpose}:${row.engine}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.costUsd += row.costUsd;
      existing.calls += 1;
    } else {
      grouped.set(key, { purpose: row.purpose, engine: row.engine, costUsd: row.costUsd, calls: 1 });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.costUsd - a.costUsd);
}
