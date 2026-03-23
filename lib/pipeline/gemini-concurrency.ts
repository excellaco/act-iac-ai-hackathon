/**
 * Shared Gemini concurrency limiter and retry utility.
 *
 * All four Gemini call sites (standard extraction, zone discovery, multi-zone
 * extraction, setbacks) import from here and share a single limiter instance per pipeline
 * run, so they draw from the same quota budget rather than competing blindly.
 *
 * Env vars (set in .env.example):
 *   GEMINI_CONCURRENCY  — max simultaneous in-flight calls (default: 5)
 *   GEMINI_MAX_RETRIES  — retry attempts on 429/RESOURCE_EXHAUSTED (default: 3)
 */

import pLimit from 'p-limit'

export type GeminiLimiter = ReturnType<typeof pLimit>

/** Create a new concurrency limiter, reading GEMINI_CONCURRENCY from env. */
export function createGeminiLimiter(): GeminiLimiter {
  const concurrency = parseInt(process.env.GEMINI_CONCURRENCY ?? '5', 10) || 5
  return pLimit(concurrency)
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /429|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)
}

/**
 * Wrap an async Gemini call with exponential-backoff retry on quota errors.
 *
 * Retries up to GEMINI_MAX_RETRIES times (default 3) on 429 / RESOURCE_EXHAUSTED.
 * All other errors are rethrown immediately — no retry on bad prompts or auth failures.
 *
 * Backoff: baseDelay * 2^attempt + jitter(0–500ms)
 *   attempt 0 → ~1 s, attempt 1 → ~2 s, attempt 2 → ~4 s
 *
 * @param fn     The async call to execute (and retry)
 * @param sleep  Injectable sleep for testing — defaults to real setTimeout
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES ?? '3', 10) || 3
  let attempt = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn()
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err
      const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500)
      await sleep(delay)
      attempt++
    }
  }
}
