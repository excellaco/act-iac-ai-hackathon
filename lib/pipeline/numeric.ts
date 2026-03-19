/**
 * Shared numeric coercion utility.
 *
 * Drizzle ORM types `numeric` columns as `string`, not `number`, because
 * PostgreSQL's NUMERIC type has arbitrary precision.  All code that writes
 * to numeric columns must go through this helper.
 *
 * Also handles word-form numbers that Gemini occasionally returns ("eight")
 * despite the typed JSON schema — Number("eight") === NaN → returns null.
 */
export function toNumericString(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : String(n)
}
