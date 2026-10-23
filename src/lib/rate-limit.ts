import { CHECKER_PER_IP_PER_DAY } from "../engine/config";

/**
 * In-memory limiter for the public checker — fine for v1's single always-on
 * process (spec explicitly rules out Redis for v1). If this ever runs across
 * multiple instances, swap for a DB- or Redis-backed counter.
 */
const perIpCounts = new Map<string, { count: number; resetAt: number }>();
let globalCount = { count: 0, resetAt: nextMidnightUtc() };

function nextMidnightUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime();
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: "ip" | "global";
}

export function checkCheckerRateLimit(ip: string): RateLimitResult {
  const now = Date.now();

  if (now >= globalCount.resetAt) {
    globalCount = { count: 0, resetAt: nextMidnightUtc() };
  }
  if (globalCount.count >= GLOBAL_DAILY_LIMIT) {
    return { allowed: false, reason: "global" };
  }

  const entry = perIpCounts.get(ip);
  if (!entry || now >= entry.resetAt) {
    perIpCounts.set(ip, { count: 0, resetAt: nextMidnightUtc() });
  }
  const current = perIpCounts.get(ip)!;
  if (current.count >= CHECKER_PER_IP_PER_DAY) {
    return { allowed: false, reason: "ip" };
  }

  return { allowed: true };
}

export function recordCheckerUse(ip: string): void {
  globalCount.count += 1;
  const entry = perIpCounts.get(ip);
  if (entry) entry.count += 1;
}

// A conservative placeholder cap on the number of checks/day; the real spend
// cap is enforced separately in src/lib/checker.ts against CHECKER_DAILY_USD_CAP.
const GLOBAL_DAILY_LIMIT = 50;

let dailySpend = { usd: 0, resetAt: nextMidnightUtc() };

export function getCheckerDailySpendUsd(): number {
  if (Date.now() >= dailySpend.resetAt) {
    dailySpend = { usd: 0, resetAt: nextMidnightUtc() };
  }
  return dailySpend.usd;
}

export function addCheckerSpendUsd(usd: number): void {
  getCheckerDailySpendUsd(); // rolls the window over if needed
  dailySpend.usd += usd;
}

export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
