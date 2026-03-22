// Mock @google-cloud/storage before importing GcsFetcher
const mockDownload = jest.fn()
const mockGetFiles = jest.fn()

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn().mockReturnValue({
      getFiles: mockGetFiles,
    }),
  })),
}))

import { GcsFetcher } from '../../lib/pipeline/gcs-fetcher'

const makeFile = (name: string, content: Buffer) => ({
  name,
  download: jest.fn().mockResolvedValue([content]),
})

describe('GcsFetcher', () => {
  it('throws on construction when RAW_DATA_BUCKET is not set', () => {
    delete process.env.RAW_DATA_BUCKET
    expect(() => new GcsFetcher()).toThrow('RAW_DATA_BUCKET')
  })

  it('accepts bucket from constructor argument', () => {
    expect(() => new GcsFetcher('my-bucket')).not.toThrow()
  })

  it('fetches the lexicographically last PDF for a jurisdiction', async () => {
    const content = Buffer.from('%PDF-1.4 fake')
    const files = [
      makeFile('zoning/fairfax/fairfax_2023.pdf', Buffer.from('old')),
      makeFile('zoning/fairfax/fairfax_2024.pdf', content),
    ]
    mockGetFiles.mockResolvedValue([files])

    const fetcher = new GcsFetcher('test-bucket')
    const result = await fetcher.fetch('uuid-1', 'fairfax')

    expect(result.bytes).toEqual(content)
    expect(result.sourceDocument).toBe('gs://test-bucket/zoning/fairfax/fairfax_2024.pdf')
  })

  it('throws when no files exist at the prefix', async () => {
    mockGetFiles.mockResolvedValue([[]])

    const fetcher = new GcsFetcher('test-bucket')
    await expect(fetcher.fetch('uuid-2', 'loudoun')).rejects.toThrow('no PDF files found')
  })

  it('ignores non-PDF objects under the same prefix (e.g. extraction artifacts)', async () => {
    const pdfContent = Buffer.from('%PDF-1.4 real')
    const files = [
      makeFile('zoning/arlington/aczo_2026.pdf', pdfContent),
      makeFile('zoning/arlington/extractions/latest.json', Buffer.from('{}')),
    ]
    mockGetFiles.mockResolvedValue([files])

    const fetcher = new GcsFetcher('test-bucket')
    const result = await fetcher.fetch('uuid-4', 'arlington')

    expect(result.bytes).toEqual(pdfContent)
    expect(result.sourceDocument).toBe('gs://test-bucket/zoning/arlington/aczo_2026.pdf')
  })

  it('throws when only non-PDF files exist at the prefix', async () => {
    const files = [makeFile('zoning/arlington/extractions/latest.json', Buffer.from('{}'))]
    mockGetFiles.mockResolvedValue([files])

    const fetcher = new GcsFetcher('test-bucket')
    await expect(fetcher.fetch('uuid-5', 'arlington')).rejects.toThrow('no PDF files found')
  })

  it('passes the correct prefix to getFiles', async () => {
    const files = [makeFile('zoning/arlington/aczo.pdf', Buffer.from('%PDF'))]
    mockGetFiles.mockResolvedValue([files])

    const fetcher = new GcsFetcher('test-bucket')
    await fetcher.fetch('uuid-3', 'arlington')

    expect(mockGetFiles).toHaveBeenCalledWith({ prefix: 'zoning/arlington/' })
  })
})
