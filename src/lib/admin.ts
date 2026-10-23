import { desc, sql } from "drizzle-orm";
import { db, schema } from "../db/client";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export async function listAllLeads() {
  return db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt));
}

export async function getCheckerUsage(): Promise<{ totalChecks: number; totalUnlocks: number }> {
  const [checks] = await db.select({ count: sql<number>`count(*)` }).from(schema.checkerResults);
  const [unlocks] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.leads)
    .where(sql`${schema.leads.checkerResultId} is not null`);
  return { totalChecks: Number(checks?.count ?? 0), totalUnlocks: Number(unlocks?.count ?? 0) };
}

export async function getTotalLlmSpend(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.llmCalls.costUsd}), 0)` })
    .from(schema.llmCalls);
  return Number(row?.total ?? 0);
}

export function leadsToCsv(leads: (typeof schema.leads.$inferSelect)[]): string {
  const header = ["created_at", "business_name", "category", "city", "email", "whatsapp", "checker_result_id"];
  const rows = leads.map((l) =>
    [
      l.createdAt.toISOString(),
      l.businessName,
      l.category ?? "",
      l.city ?? "",
      l.email ?? "",
      l.whatsapp ?? "",
      l.checkerResultId ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
