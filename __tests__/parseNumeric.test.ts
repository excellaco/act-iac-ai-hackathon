import { parseNumeric } from '../lib/mockData'

describe('parseNumeric', () => {
  it('parses a valid numeric string', () => {
    expect(parseNumeric('42', 0)).toBe(42)
    expect(parseNumeric('3.14', 0)).toBe(3.14)
    expect(parseNumeric('-10', 0)).toBe(-10)
  })

  it('correctly parses "0" as zero, not fallback', () => {
    expect(parseNumeric('0', 999)).toBe(0)
    expect(parseNumeric('0.0', 999)).toBe(0)
  })

  it('returns fallback for null', () => {
    expect(parseNumeric(null, 42)).toBe(42)
  })

  it('returns fallback for undefined', () => {
    expect(parseNumeric(undefined, 42)).toBe(42)
  })

  it('returns fallback for non-numeric strings', () => {
    expect(parseNumeric('N/A', 0)).toBe(0)
    expect(parseNumeric('', 0)).toBe(0)
    expect(parseNumeric('abc', 10)).toBe(10)
  })

  it('returns fallback for NaN-producing strings', () => {
    expect(parseNumeric('not-a-number', 5)).toBe(5)
  })

  it('handles strings with leading/trailing whitespace', () => {
    expect(parseNumeric(' 42 ', 0)).toBe(42)
  })

  it('handles strings with numeric prefix (parseFloat behavior)', () => {
    // parseFloat('12abc') returns 12 — this is intentional JS behavior
    expect(parseNumeric('12abc', 0)).toBe(12)
  })
})
