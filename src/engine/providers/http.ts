import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from "../config";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Fetch with a per-call timeout and exponential backoff on 429/5xx, as required
 * by the engine spec (max 3 attempts, 60s timeout per call).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? PROVIDER_MAX_RETRIES;
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastError = new HttpError(res.status, `HTTP ${res.status} from ${url}`);
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        const body = await safeJson(res);
        throw new HttpError(res.status, `HTTP ${res.status} from ${url}`, body);
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const isAbort = err instanceof Error && err.name === "AbortError";
      const isRetryable = isAbort || err instanceof HttpError;
      if (isRetryable && attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 200;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
