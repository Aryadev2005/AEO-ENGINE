import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBrand, listPrompts } from "@/lib/brands";
import { requireSessionOrResponse } from "@/lib/session";
import { enqueueScan } from "@/db/scan-service";
import { estimateCallCostUsd } from "@/engine/config";
import { ALL_ENGINES } from "@/engine/providers";

// This route always reads/writes live DB state; Next's Cache Components
// would otherwise try to prerender and cache it.
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  engines: z.array(z.enum(["chatgpt", "claude", "gemini", "perplexity"])).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  const { id: brandId } = await params;
  const brand = await getBrand(brandId, session.workspaceId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const engines = parsed.data.engines ?? ALL_ENGINES;
  const prompts = await listPrompts(brandId);
  const activePromptCount = prompts.filter((p) => p.isActive).length;

  if (activePromptCount === 0) {
    return NextResponse.json({ error: "Brand has no active prompts" }, { status: 400 });
  }

  const estimatedCostUsd = engines.reduce(
    (sum, engine) => sum + estimateCallCostUsd(engine) * activePromptCount,
    0,
  );

  const scanId = await enqueueScan(brandId, engines, "manual");

  return NextResponse.json({ scanId, estimatedCostUsd }, { status: 202 });
}
