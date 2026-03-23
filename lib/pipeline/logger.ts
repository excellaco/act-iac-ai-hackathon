/**
 * PipelineLogger interface and consoleLogger default implementation.
 *
 * Extracted from errors.ts into its own module so that gemini-concurrency.ts
 * can import PipelineLogger without creating a circular dependency:
 *   errors.ts → gemini-concurrency.ts → errors.ts (cycle)
 *
 * All other pipeline modules continue to import from errors.ts, which
 * re-exports everything here for backward compatibility.
 *
 * Set LOG_LEVEL=debug to enable debug output (silent by default).
 */

export interface PipelineLogger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  /** Only emitted when LOG_LEVEL=debug. No-op otherwise. */
  debug?(message: string, meta?: Record<string, unknown>): void
}

/** Default logger — writes structured JSON to console. */
export const consoleLogger: PipelineLogger = {
  info:  (msg, meta) => console.log(JSON.stringify({ level: 'info',  msg, ...meta })),
  warn:  (msg, meta) => console.warn(JSON.stringify({ level: 'warn', msg, ...meta })),
  error: (msg, meta) => console.error(JSON.stringify({ level: 'error', msg, ...meta })),
  debug: (msg, meta) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(JSON.stringify({ level: 'debug', msg, ...meta }))
    }
  },
}
