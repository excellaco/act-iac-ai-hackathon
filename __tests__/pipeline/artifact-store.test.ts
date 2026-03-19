/**
 * E0-8: Unit tests for LocalArtifactStore
 */
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { LocalArtifactStore } from '../../lib/pipeline/artifact-store'
import { ExtractionArtifact } from '../../lib/pipeline/artifact'

function makeArtifact(slug: string): ExtractionArtifact {
  return {
    jurisdictionId: 'jur-uuid-1',
    slug,
    sourceDocument: 'gs://bucket/test.pdf',
    extractedAt: '2026-03-18T00:00:00.000Z',
    fields: {
      height_limit_ft: {
        raw_value: 35,
        raw_unit: 'ft',
        field_value: 35,
        field_value_text: '35 feet maximum height',
        unit: 'ft',
        confidence: 'high',
        source_section: 'Section 1',
        district_context: 'R-1',
        reasoning: 'Direct extraction',
      },
    },
  }
}

describe('LocalArtifactStore', () => {
  let tmpDir: string
  let store: LocalArtifactStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'parcela-test-'))
    store = new LocalArtifactStore(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('writes an artifact to {dir}/{slug}.json', async () => {
    const artifact = makeArtifact('fairfax-va')
    await store.write('fairfax-va', artifact)

    const filePath = path.join(tmpDir, 'fairfax-va.json')
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.slug).toBe('fairfax-va')
    expect(parsed.fields.height_limit_ft.field_value).toBe(35)
  })

  it('reads an artifact back correctly', async () => {
    const artifact = makeArtifact('arlington-va')
    await store.write('arlington-va', artifact)

    const read = await store.read('arlington-va')
    expect(read.slug).toBe('arlington-va')
    expect(read.jurisdictionId).toBe('jur-uuid-1')
    expect(read.fields.height_limit_ft.confidence).toBe('high')
  })

  it('throws a descriptive error when artifact not found', async () => {
    await expect(store.read('missing-slug')).rejects.toThrow(
      /No artifact found.*missing-slug.*pipeline:extract/,
    )
  })

  it('creates the directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'dir')
    const nestedStore = new LocalArtifactStore(nestedDir)
    await nestedStore.write('test-slug', makeArtifact('test-slug'))

    const filePath = path.join(nestedDir, 'test-slug.json')
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('overwrites an existing artifact on re-write', async () => {
    await store.write('fairfax-va', makeArtifact('fairfax-va'))

    const updated = makeArtifact('fairfax-va')
    updated.fields.height_limit_ft.field_value = 50
    await store.write('fairfax-va', updated)

    const read = await store.read('fairfax-va')
    expect(read.fields.height_limit_ft.field_value).toBe(50)
  })
})
