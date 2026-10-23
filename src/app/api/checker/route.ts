import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CHECKER_DAILY_USD_CAP } from "@/engine/config";
import { runChecker } from "@/lib/checker";
import {
  checkCheckerRateLimit,
  clientIpFrom,
  getCheckerDailySpendUsd,
  recordCheckerUse,
} from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

// Rate limits and daily spend are in-memory and request-scoped; never cache this route.
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  businessName: z.string().min(1).max(200),
  category: z.string().min(1).max(200),
  city: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  website: z.string().url().optional(),
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ip = clientIpFrom(req.headers);

  const humanVerified = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json({ error: "Verification failed — please try again" }, { status: 400 });
  }

  const rate = checkCheckerRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.reason === "ip" ? "Daily limit reached for this IP" : "Daily checker limit reached, try again tomorrow" },
      { status: 429 },
    );
  }

  if (getCheckerDailySpendUsd() >= CHECKER_DAILY_USD_CAP) {
    return NextResponse.json(
      { error: "The free checker has hit its daily budget — try again tomorrow" },
      { status: 429 },
    );
  }

  try {
    const mini = await runChecker(parsed.data);
    recordCheckerUse(ip);
    return NextResponse.json(mini);
  } catch (err) {
    console.error("checker failed:", err);
    return NextResponse.json({ error: "Checker failed, please try again" }, { status: 500 });
  }
}
