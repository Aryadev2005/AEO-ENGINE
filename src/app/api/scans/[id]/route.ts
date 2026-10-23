import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { getBrand } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

// Polled by the UI for live scan progress; must never be served from cache.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id: scanId } = await params;

  const [scan] = await db.select().from(schema.scans).where(eq(schema.scans.id, scanId));
  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const brand = await getBrand(scan.brandId, session.workspaceId);
  if (!brand) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const scores =
    scan.status === "done"
      ? await db.select().from(schema.scores).where(eq(schema.scores.scanId, scanId))
      : [];

  return NextResponse.json({ scan, scores });
}
