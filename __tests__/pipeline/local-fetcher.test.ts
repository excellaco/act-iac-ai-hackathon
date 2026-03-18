import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { LocalFetcher } from '../../lib/pipeline/local-fetcher'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'local-fetcher-test-'))
}

describe('LocalFetcher', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns bytes and sourceDocument for a jurisdiction with one PDF', async () => {
    const dir = path.join(tmpDir, 'zoning', 'fairfax')
    fs.mkdirSync(dir, { recursive: true })
    const content = Buffer.from('%PDF-1.4 fake content')
    fs.writeFileSync(path.join(dir, 'fairfax_zoning_2024.pdf'), content)

    const fetcher = new LocalFetcher(tmpDir)
    const result = await fetcher.fetch('fairfax')

    expect(result.bytes).toEqual(content)
    expect(result.sourceDocument).toContain('fairfax_zoning_2024.pdf')
  })

  it('picks the lexicographically last PDF when multiple exist', async () => {
    const dir = path.join(tmpDir, 'zoning', 'fairfax')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'fairfax_2023.pdf'), Buffer.from('old'))
    fs.writeFileSync(path.join(dir, 'fairfax_2024.pdf'), Buffer.from('new'))

    const fetcher = new LocalFetcher(tmpDir)
    const result = await fetcher.fetch('fairfax')

    expect(result.sourceDocument).toContain('fairfax_2024.pdf')
    expect(result.bytes.toString()).toBe('new')
  })

  it('throws when the jurisdiction directory does not exist', async () => {
    const fetcher = new LocalFetcher(tmpDir)
    await expect(fetcher.fetch('missing')).rejects.toThrow('directory not found')
  })

  it('throws when the directory exists but contains no PDFs', async () => {
    const dir = path.join(tmpDir, 'zoning', 'empty')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a pdf')

    const fetcher = new LocalFetcher(tmpDir)
    await expect(fetcher.fetch('empty')).rejects.toThrow('no PDF files')
  })

  it('includes local:// prefix in sourceDocument', async () => {
    const dir = path.join(tmpDir, 'zoning', 'arlington')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'arlington_aczo.pdf'), Buffer.from('%PDF'))

    const fetcher = new LocalFetcher(tmpDir)
    const result = await fetcher.fetch('arlington')

    expect(result.sourceDocument).toMatch(/^local:\/\//)
  })
})
