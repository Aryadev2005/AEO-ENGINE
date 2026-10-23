import { randomUUID } from "node:crypto";
import { db, schema } from "../db/client";

export interface SaveLeadInput {
  businessName: string;
  category?: string | null;
  city?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  checkerResultId?: string | null;
  utm?: Record<string, string>;
}

export async function saveLead(input: SaveLeadInput): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.leads).values({
    id,
    businessName: input.businessName,
    category: input.category ?? null,
    city: input.city ?? null,
    email: input.email ?? null,
    whatsapp: input.whatsapp ?? null,
    checkerResultId: input.checkerResultId ?? null,
    utm: input.utm ?? {},
  });
  return id;
}
