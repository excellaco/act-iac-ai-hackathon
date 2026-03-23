/**
 * @jest-environment node
 */

import { consoleLogger } from '../../lib/pipeline/logger'

describe('consoleLogger', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'warn').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = originalEnv
  })

  it('info logs structured JSON to console.log', () => {
    consoleLogger.info('test message', { key: 'value' })

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ level: 'info', msg: 'test message', key: 'value' }),
    )
  })

  it('warn logs structured JSON to console.warn', () => {
    consoleLogger.warn('warning message')

    expect(console.warn).toHaveBeenCalledWith(
      JSON.stringify({ level: 'warn', msg: 'warning message' }),
    )
  })

  it('error logs structured JSON to console.error', () => {
    consoleLogger.error('error message', { code: 500 })

    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({ level: 'error', msg: 'error message', code: 500 }),
    )
  })

  it('debug is silent when LOG_LEVEL is not debug', () => {
    delete process.env.LOG_LEVEL

    consoleLogger.debug?.('should not appear')

    expect(console.log).not.toHaveBeenCalled()
  })

  it('debug logs when LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug'

    consoleLogger.debug?.('debug message', { detail: true })

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ level: 'debug', msg: 'debug message', detail: true }),
    )
  })
})
