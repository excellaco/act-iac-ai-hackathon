/**
 * E0-2: Zoning PDF text chunker
 *
 * Splits extracted PDF text into overlapping chunks suitable for LLM prompts.
 *
 * Design goals (from acceptance criteria):
 * - Chunks are ≤ MAX_TOKENS tokens
 * - Adjacent chunks overlap by ~OVERLAP_TOKENS tokens so mid-sentence splits
 *   don't cause a field to be missed
 * - Chunk boundaries respect section headers where possible so the model can
 *   identify source_section accurately
 *
 * Token estimation: we use a 4-chars-per-token approximation rather than a
 * full tokenizer to keep this dependency-free and fast.  The approximation is
 * conservative enough for zoning ordinance prose.
 */

export const MAX_TOKENS = 4_000
export const OVERLAP_TOKENS = 500

/** ~4 characters per token — conservative estimate for legal/ordinance prose */
const CHARS_PER_TOKEN = 4

/** Regex matching common zoning ordinance section header patterns */
const SECTION_HEADER_RE =
  /^(?:section|article|division|chapter|part)\s+[\d.A-Z-]+[^\n]*/im

/**
 * A single text chunk ready to be sent to an LLM extraction prompt.
 */
export interface TextChunk {
  /** Zero-based index within the chunk sequence for this document */
  index: number
  /** The text content to include in the prompt */
  text: string
  /** Estimated token count */
  estimatedTokens: number
  /** Section header detected at the start of this chunk, if any */
  sectionHint: string | null
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function charsForTokens(tokens: number): number {
  return tokens * CHARS_PER_TOKEN
}

/**
 * Extract the first section header line from a text block, or null.
 */
function extractSectionHint(text: string): string | null {
  const match = text.match(SECTION_HEADER_RE)
  return match ? match[0].trim() : null
}

/**
 * Split text into paragraphs (double-newline boundaries).
 * Single newlines within a paragraph are preserved.
 */
function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
}

// ─── main chunker ─────────────────────────────────────────────────────────────

/**
 * Chunk a full zoning ordinance text into overlapping segments.
 *
 * Algorithm:
 * 1. Split the text on section headers to get natural document segments.
 * 2. Walk segments, accumulating into a current chunk until the token budget
 *    is reached.
 * 3. When the budget is reached, emit the chunk and start a new one seeded
 *    with the last OVERLAP_TOKENS chars of the previous chunk (overlap).
 * 4. If a single paragraph exceeds MAX_TOKENS on its own, hard-split it at
 *    the character boundary.
 */
export function chunkText(
  text: string,
  maxTokens: number = MAX_TOKENS,
  overlapTokens: number = OVERLAP_TOKENS,
): TextChunk[] {
  if (!text || text.trim().length === 0) return []

  const maxChars = charsForTokens(maxTokens)
  const overlapChars = charsForTokens(overlapTokens)

  const paragraphs = splitIntoParagraphs(text)
  const chunks: TextChunk[] = []

  let current = ''
  let overlapSeed = ''

  const emitChunk = () => {
    const trimmed = current.trim()
    if (trimmed.length === 0) return
    chunks.push({
      index: chunks.length,
      text: trimmed,
      estimatedTokens: estimateTokens(trimmed),
      sectionHint: extractSectionHint(trimmed),
    })
    // seed next chunk with the tail of this one for overlap
    overlapSeed = trimmed.slice(-overlapChars)
    current = ''
  }

  for (const para of paragraphs) {
    // If this single paragraph is larger than the budget, hard-split it
    if (para.length > maxChars) {
      // emit whatever we have so far
      if (current.trim()) emitChunk()

      let offset = 0
      while (offset < para.length) {
        const slice = (offset === 0 ? overlapSeed + para : para).slice(
          offset === 0 ? 0 : offset - overlapChars,
          offset === 0 ? maxChars : offset - overlapChars + maxChars,
        )
        current = slice
        emitChunk()
        offset += maxChars - overlapChars
      }
      continue
    }

    const candidate = current
      ? current + '\n\n' + para
      : overlapSeed
        ? overlapSeed + '\n\n' + para
        : para

    if (candidate.length > maxChars && current.trim()) {
      // current chunk is full — emit and start fresh with this paragraph
      emitChunk()
      if (overlapSeed) {
        // include as much overlap as fits alongside the paragraph
        const separator = '\n\n'
        const available = maxChars - para.length - separator.length
        const trimmedSeed = available > 0 ? overlapSeed.slice(-available) : ''
        current = trimmedSeed ? trimmedSeed + separator + para : para
      } else {
        current = para
      }
    } else {
      current = candidate
    }
  }

  // emit any remaining text
  if (current.trim()) emitChunk()

  return chunks
}
