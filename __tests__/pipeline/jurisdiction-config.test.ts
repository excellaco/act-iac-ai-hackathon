import fs from 'fs'
import path from 'path'
import { loadJurisdictionConfig } from '../../lib/pipeline/jurisdiction-config'

jest.mock('fs')
const mockReadFileSync = fs.readFileSync as jest.Mock

describe('loadJurisdictionConfig', () => {
  const expectedPath = path.join('data', 'config', 'fairfax_va.json')

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('returns {} when config file does not exist', () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFileSync.mockImplementation(() => { throw err })

    const config = loadJurisdictionConfig('fairfax_va')
    expect(config).toEqual({})
  })

  it('reads config from the correct path', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ pdf_extraction: 'text' }))

    loadJurisdictionConfig('fairfax_va')

    expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf-8')
  })

  it('parses and returns pdf_source', () => {
    const raw = { pdf_source: 'gs://bucket/zoning/fairfax_va/file.pdf' }
    mockReadFileSync.mockReturnValue(JSON.stringify(raw))

    const config = loadJurisdictionConfig('fairfax_va')
    expect(config.pdf_source).toBe('gs://bucket/zoning/fairfax_va/file.pdf')
  })

  it('parses and returns pdf_extraction', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ pdf_extraction: 'ocr' }))

    const config = loadJurisdictionConfig('fairfax_va')
    expect(config.pdf_extraction).toBe('ocr')
  })

  it('parses and returns ocr_source', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ ocr_source: 'gs://bucket/zoning/fairfax_va/ocr/' }))

    const config = loadJurisdictionConfig('fairfax_va')
    expect(config.ocr_source).toBe('gs://bucket/zoning/fairfax_va/ocr/')
  })

  it('parses all fields together', () => {
    const raw = {
      pdf_source: 'gs://bucket/zoning/fairfax_va/file.pdf',
      pdf_extraction: 'ocr',
      ocr_source: 'gs://bucket/zoning/fairfax_va/ocr/',
    }
    mockReadFileSync.mockReturnValue(JSON.stringify(raw))

    const config = loadJurisdictionConfig('fairfax_va')
    expect(config).toEqual(raw)
  })

  it('throws on malformed JSON (non-ENOENT error)', () => {
    mockReadFileSync.mockReturnValue('{ not valid json }}}')

    expect(() => loadJurisdictionConfig('fairfax_va')).toThrow()
  })

  it('re-throws non-ENOENT filesystem errors', () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockReadFileSync.mockImplementation(() => { throw err })

    expect(() => loadJurisdictionConfig('fairfax_va')).toThrow('EACCES')
  })

  it('uses the slug to build the config file path', () => {
    mockReadFileSync.mockReturnValue('{}')

    loadJurisdictionConfig('loudoun_va')

    expect(mockReadFileSync).toHaveBeenCalledWith(
      path.join('data', 'config', 'loudoun_va.json'),
      'utf-8',
    )
  })
})
