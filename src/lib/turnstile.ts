const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
export const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_CONFIGURED = Boolean(TURNSTILE_SECRET_KEY && TURNSTILE_SITE_KEY);

/** No key configured → always passes (stub mode, per spec §7). */
export async function verifyTurnstile(token: string | undefined, remoteIp: string): Promise<boolean> {
  if (!TURNSTILE_CONFIGURED) return true;
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET_KEY!, response: token, remoteip: remoteIp }),
    });
    const json = (await res.json()) as { success: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
