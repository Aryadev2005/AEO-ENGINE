import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBrand } from "@/lib/brands";
import { PLACES_CONFIGURED, searchPlaces } from "@/lib/places";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ query: z.string().min(1).max(200) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!PLACES_CONFIGURED) {
    return NextResponse.json({ error: "Google Places isn't connected" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const candidates = await searchPlaces(parsed.data.query);
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
