/**
 * Unit tests for Gemini concurrency limiter and retry utility
 */
import { withRetry, createGeminiLimiter } from '../../lib/pipeline/gemini-concurrency'

const noopSleep = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.GEMINI_MAX_RETRIES
  delete process.env.GEMINI_CONCURRENCY
})

// ─── withRetry ────────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('returns the result immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('result')
    const result = await withRetry(fn, noopSleep)
    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(noopSleep).not.toHaveBeenCalled()
  })

  it('retries on RESOURCE_EXHAUSTED and succeeds on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED: quota exceeded'))
      .mockResolvedValueOnce('ok')
    const result = await withRetry(fn, noopSleep)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(noopSleep).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 error message', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('429 Too Many Requests'))
      .mockResolvedValueOnce('ok')
    const result = await withRetry(fn, noopSleep)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on "rate limit" message', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('rate limit reached'))
      .mockResolvedValueOnce('ok')
    const result = await withRetry(fn, noopSleep)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('rethrows immediately on non-retryable errors without sleeping', async () => {
    const err = new Error('invalid JSON in response')
    const fn = jest.fn().mockRejectedValue(err)
    await expect(withRetry(fn, noopSleep)).rejects.toThrow('invalid JSON in response')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(noopSleep).not.toHaveBeenCalled()
  })

  it('gives up after GEMINI_MAX_RETRIES attempts and rethrows', async () => {
    process.env.GEMINI_MAX_RETRIES = '2'
    const err = new Error('RESOURCE_EXHAUSTED')
    const fn = jest.fn().mockRejectedValue(err)
    await expect(withRetry(fn, noopSleep)).rejects.toThrow('RESOURCE_EXHAUSTED')
    // 1 initial attempt + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3)
    expect(noopSleep).toHaveBeenCalledTimes(2)
  })

  it('uses exponential backoff — second delay is at least 2× first delay', async () => {
    process.env.GEMINI_MAX_RETRIES = '3'
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'))
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce('done')

    const delays: number[] = []
    const capturingSleep = jest.fn().mockImplementation(async (ms: number) => {
      delays.push(ms)
    })

    await withRetry(fn, capturingSleep)

    expect(delays).toHaveLength(2)
    // First delay: 2^0 * 1000 + jitter ≥ 1000ms
    expect(delays[0]).toBeGreaterThanOrEqual(1000)
    // Second delay: 2^1 * 1000 + jitter ≥ 2000ms
    expect(delays[1]).toBeGreaterThanOrEqual(2000)
    // Second delay is meaningfully larger than first
    expect(delays[1]).toBeGreaterThan(delays[0])
  })

  it('defaults to 3 retries when GEMINI_MAX_RETRIES is unset', async () => {
    const err = new Error('RESOURCE_EXHAUSTED')
    const fn = jest.fn().mockRejectedValue(err)
    await expect(withRetry(fn, noopSleep)).rejects.toThrow()
    // 1 initial + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4)
  })
})

// ─── createGeminiLimiter ──────────────────────────────────────────────────────

describe('createGeminiLimiter', () => {
  it('creates a limiter that executes async functions', async () => {
    const limiter = createGeminiLimiter()
    const result = await limiter(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('respects GEMINI_CONCURRENCY cap', async () => {
    process.env.GEMINI_CONCURRENCY = '2'
    const limiter = createGeminiLimiter()

    let activeCount = 0
    let maxObserved = 0

    const task = () =>
      limiter(async () => {
        activeCount++
        maxObserved = Math.max(maxObserved, activeCount)
        await Promise.resolve()
        activeCount--
      })

    await Promise.all([task(), task(), task(), task()])
    expect(maxObserved).toBeLessThanOrEqual(2)
  })

  it('falls back to default concurrency of 5 when GEMINI_CONCURRENCY is non-numeric', async () => {
    process.env.GEMINI_CONCURRENCY = 'abc'
    // Should not throw (pLimit(NaN) would misbehave without the || 5 guard)
    expect(() => createGeminiLimiter()).not.toThrow()
  })
})

describe('withRetry NaN guard', () => {
  it('falls back to 3 retries when GEMINI_MAX_RETRIES is non-numeric', async () => {
    process.env.GEMINI_MAX_RETRIES = 'abc'
    const err = new Error('RESOURCE_EXHAUSTED')
    const fn = jest.fn().mockRejectedValue(err)
    await expect(withRetry(fn, noopSleep)).rejects.toThrow()
    // Should use fallback of 3, not retry infinitely
    expect(fn).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
  })
})
