import { NextRequest, NextResponse } from "next/server";
import { getBrand, getScanResults } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id } = await params;
  const brand = await getBrand(id, session.workspaceId);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scanId = req.nextUrl.searchParams.get("scanId");
  if (!scanId) return NextResponse.json({ error: "scanId query param is required" }, { status: 400 });

  const data = await getScanResults(id, scanId);
  if (!data) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  return NextResponse.json(data);
}
