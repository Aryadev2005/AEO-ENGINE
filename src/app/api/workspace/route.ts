import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionOrResponse } from "@/lib/session";
import { updateWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  monthlyBudgetUsd: z.number().min(0).max(100000).optional(),
});

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireSessionOrResponse();
  if (response) return response;

  if (session.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can change these settings" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await updateWorkspace(session.workspaceId, parsed.data);
  return NextResponse.json({ ok: true });
}
