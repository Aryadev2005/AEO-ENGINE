import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFullCheckerResult } from "@/lib/checker";
import { saveLead } from "@/lib/leads";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    email: z.string().email().optional(),
    whatsapp: z.string().min(6).max(20).optional(),
    consent: z.literal(true),
    utm: z.record(z.string(), z.string()).optional(),
  })
  .refine((data) => data.email || data.whatsapp, {
    message: "Provide an email or a WhatsApp number",
  });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkerResultId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const full = await getFullCheckerResult(checkerResultId);
  if (!full) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await saveLead({
    businessName: full.input.businessName,
    category: full.input.category,
    city: full.input.city,
    email: parsed.data.email,
    whatsapp: parsed.data.whatsapp,
    checkerResultId,
    utm: parsed.data.utm,
  });

  return NextResponse.json(full);
}
