import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveLead } from "@/lib/leads";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    businessName: z.string().min(1).max(200),
    category: z.string().max(200).optional(),
    city: z.string().max(200).optional(),
    email: z.string().email().optional(),
    whatsapp: z.string().min(6).max(20).optional(),
    utm: z.record(z.string(), z.string()).optional(),
  })
  .refine((data) => data.email || data.whatsapp, {
    message: "Provide an email or a WhatsApp number",
  });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = await saveLead({
    businessName: parsed.data.businessName,
    category: parsed.data.category,
    city: parsed.data.city,
    email: parsed.data.email,
    whatsapp: parsed.data.whatsapp,
    utm: parsed.data.utm,
  });

  return NextResponse.json({ id });
}
