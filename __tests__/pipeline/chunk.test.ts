/**
 * E0-2: Unit tests for zoning text chunker
 */
import { chunkText, MAX_TOKENS, OVERLAP_TOKENS, TextChunk } from '../../lib/pipeline/chunk'

const CHARS_PER_TOKEN = 4

function makeText(paragraphs: string[]): string {
  return paragraphs.join('\n\n')
}

function para(chars: number, label = 'x'): string {
  return label.repeat(chars)
}

// ─── basic behaviour ──────────────────────────────────────────────────────────

describe('basic chunking', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('returns a single chunk when text fits within budget', () => {
    const text = makeText(['Short paragraph one.', 'Short paragraph two.'])
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].index).toBe(0)
  })

  it('assigns sequential index values', () => {
    // produce text that requires 3+ chunks at a small budget
    const text = makeText([para(80), para(80), para(80), para(80), para(80)])
    const chunks = chunkText(text, 50, 10) // small budget for testing
    chunks.forEach((c, i) => expect(c.index).toBe(i))
  })

  it('includes estimatedTokens on every chunk', () => {
    const text = 'Hello world. This is a test.'
    const chunks = chunkText(text)
    expect(chunks[0].estimatedTokens).toBeGreaterThan(0)
  })

  it('no chunk exceeds MAX_TOKENS', () => {
    // 20 paragraphs of 500 chars each → well over one 4000-token chunk
    const paragraphs = Array.from({ length: 20 }, (_, i) => para(500, String(i % 10)))
    const text = makeText(paragraphs)
    const chunks = chunkText(text)
    chunks.forEach((c) => {
      expect(c.estimatedTokens).toBeLessThanOrEqual(MAX_TOKENS)
    })
  })
})

// ─── token budget ─────────────────────────────────────────────────────────────

describe('token budget enforcement', () => {
  it('splits into multiple chunks when text exceeds budget', () => {
    // each paragraph is 200 chars = 50 tokens; budget 60 tokens = 240 chars
    const paragraphs = Array.from({ length: 6 }, () => para(200))
    const text = makeText(paragraphs)
    const chunks = chunkText(text, 60, 10)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('respects a custom maxTokens value', () => {
    const text = makeText([para(400), para(400), para(400)])
    const chunks = chunkText(text, 100, 20)
    chunks.forEach((c) => {
      expect(c.estimatedTokens).toBeLessThanOrEqual(100)
    })
  })

  it('hard-splits a single oversized paragraph without losing content', () => {
    // one paragraph of 10,000 chars = 2,500 tokens — exceeds default budget
    const bigPara = para(10_000, 'a')
    const chunks = chunkText(bigPara)
    const reassembled = chunks.map((c) => c.text).join('')
    // all 'a' characters should be present (overlap duplicates some, but none lost)
    expect(reassembled.replace(/[^a]/g, '').length).toBeGreaterThanOrEqual(10_000)
  })
})

// ─── overlap ──────────────────────────────────────────────────────────────────

describe('overlap', () => {
  it('subsequent chunk starts with content from the end of the previous chunk', () => {
    // 4 paragraphs of 300 chars each; budget 80 tokens (320 chars), overlap 20 tokens (80 chars)
    const paragraphs = ['AAAA'.repeat(75), 'BBBB'.repeat(75), 'CCCC'.repeat(75), 'DDDD'.repeat(75)]
    const text = makeText(paragraphs)
    const chunks = chunkText(text, 80, 20)

    expect(chunks.length).toBeGreaterThan(1)
    // The second chunk should contain some content from the tail of the first.
    // Use a small slice (10 chars) — the exact amount of overlap varies with
    // paragraph size relative to the budget.
    const firstTail = chunks[0].text.slice(-80)
    expect(chunks[1].text).toContain(firstTail.slice(0, 10))
  })

  it('overlap does not cause a chunk to exceed the token budget', () => {
    const paragraphs = Array.from({ length: 10 }, () => para(300))
    const text = makeText(paragraphs)
    const chunks = chunkText(text, 80, 20)
    chunks.forEach((c) => expect(c.estimatedTokens).toBeLessThanOrEqual(80))
  })
})

// ─── section hints ────────────────────────────────────────────────────────────

describe('section hints', () => {
  it('extracts a section header as sectionHint', () => {
    const text = 'Section 3-201: R-1 Residential District\nMinimum lot area: 8,000 square feet.'
    const chunks = chunkText(text)
    expect(chunks[0].sectionHint).toMatch(/Section 3-201/i)
  })

  it('extracts an article header', () => {
    const text = 'Article VI: TR-1 Transitional Residential\nHeight limit: 35 feet.'
    const chunks = chunkText(text)
    expect(chunks[0].sectionHint).toMatch(/Article VI/i)
  })

  it('returns null sectionHint when no header is present', () => {
    const text = 'The minimum lot area for all residential lots shall be 8,000 square feet.'
    const chunks = chunkText(text)
    expect(chunks[0].sectionHint).toBeNull()
  })
})

// ─── real-world-ish zoning text ───────────────────────────────────────────────

describe('realistic zoning text', () => {
  const zoningSnippet = `
Section 3-201: R-1 Single-Family Residential District

3-201.01 Purpose
The R-1 district is established to provide for low-density single-family
residential development in areas served by public water and sewer.

3-201.02 Permitted Uses
(A) Single-family detached dwellings
(B) Accessory structures
(C) Home occupations subject to Section 10-100

3-201.03 Dimensional Requirements
Minimum Lot Area: 8,000 square feet
Minimum Lot Width: 75 feet
Minimum Front Yard: 30 feet
Minimum Side Yard: 10 feet (each side)
Minimum Rear Yard: 25 feet
Maximum Building Height: 35 feet
Maximum Lot Coverage: 40%

Section 3-202: R-2 Medium-Density Residential District

3-202.01 Purpose
The R-2 district accommodates medium-density residential development.

3-202.02 Dimensional Requirements
Minimum Lot Area: 5,000 square feet
Minimum Lot Width: 50 feet
Minimum Front Yard: 20 feet
Minimum Side Yard: 5 feet
Minimum Rear Yard: 20 feet
Maximum Building Height: 45 feet or 4 stories, whichever is less
  `.trim()

  it('chunks realistic zoning text without error', () => {
    const chunks = chunkText(zoningSnippet)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    chunks.forEach((c) => {
      expect(c.estimatedTokens).toBeLessThanOrEqual(MAX_TOKENS)
      expect(c.text.length).toBeGreaterThan(0)
    })
  })

  it('short zoning text fits in a single chunk', () => {
    const chunks = chunkText(zoningSnippet)
    // this snippet is ~400 tokens — should fit in one chunk
    expect(chunks).toHaveLength(1)
  })

  it('preserves section header in sectionHint', () => {
    const chunks = chunkText(zoningSnippet)
    expect(chunks[0].sectionHint).toMatch(/Section 3-201/i)
  })
})
