/**
 * E0-8: Unit tests for LocalArtifactStore (v2 API)
 */
import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { LocalArtifactStore } from '../../lib/pipeline/artifact-store'
import { ZonesArtifact, ZoneFieldsArtifact } from '../../lib/pipeline/artifact'

function makeZonesArtifact(slug: string): ZonesArtifact {
  return {
    slug,
    jurisdictionId: 'jur-uuid-1',
    sourceDocument: 'gs://bucket/test.pdf',
    extractedAt: '2026-03-18T00:00:00.000Z',
    approved: false,
    include_in_extraction: true,
    include_in_load: true,
    zones: [
      {
        zone_code: 'R-1',
        zone_name: 'Residential',
        multifamily_classification: 'primary',
        include_in_extraction: true,
        include_in_load: true,
        source_pages: [10, 11],
      },
    ],
  }
}

function makeZoneFieldsArtifact(slug: string, zoneCode: string): ZoneFieldsArtifact {
  return {
    slug,
    zoneCode,
    zoneName: 'Residential',
    multifamilyClassification: 'primary',
    jurisdictionId: 'jur-uuid-1',
    extractedAt: '2026-03-18T00:00:00.000Z',
    approved: false,
    fields: {
      height_limit_ft: {
        raw_value: 35,
        raw_unit: 'ft',
        field_value: 35,
        field_value_text: '35 feet maximum height',
        unit: 'ft',
        confidence: 'high',
        source_section: 'Section 1',
        source_page: 10,
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

  it('writes a zones artifact to {dir}/{slug}/{slug}_zones.json', async () => {
    const artifact = makeZonesArtifact('fairfax_va')
    await store.writeZones('fairfax_va', artifact)

    const filePath = path.join(tmpDir, 'fairfax_va', 'fairfax_va_zones.json')
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.slug).toBe('fairfax_va')
    expect(parsed.zones).toHaveLength(1)
  })

  it('reads a zones artifact back correctly', async () => {
    const artifact = makeZonesArtifact('arlington_va')
    await store.writeZones('arlington_va', artifact)

    const read = await store.readZones('arlington_va')
    expect(read.slug).toBe('arlington_va')
    expect(read.jurisdictionId).toBe('jur-uuid-1')
    expect(read.zones[0].zone_code).toBe('R-1')
  })

  it('throws a descriptive error when zones artifact not found', async () => {
    await expect(store.readZones('missing-slug')).rejects.toThrow(
      /No zones artifact.*missing-slug.*pipeline:zones/,
    )
  })

  it('writes a zone fields artifact to {dir}/{slug}/{slug}_{zone}_fields.json', async () => {
    const artifact = makeZoneFieldsArtifact('fairfax_va', 'R-1')
    await store.writeZoneFields('fairfax_va', 'R-1', artifact)

    const filePath = path.join(tmpDir, 'fairfax_va', 'fairfax_va_r-1_fields.json')
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.zoneCode).toBe('R-1')
    expect(parsed.fields.height_limit_ft.field_value).toBe(35)
  })

  it('reads a zone fields artifact back correctly', async () => {
    const artifact = makeZoneFieldsArtifact('arlington_va', 'RA14-26')
    await store.writeZoneFields('arlington_va', 'RA14-26', artifact)

    const read = await store.readZoneFields('arlington_va', 'RA14-26')
    expect(read.zoneCode).toBe('RA14-26')
    expect(read.fields.height_limit_ft.confidence).toBe('high')
  })

  it('throws a descriptive error when zone fields artifact not found', async () => {
    await expect(store.readZoneFields('missing-slug', 'R-1')).rejects.toThrow(
      /No fields artifact.*missing-slug.*pipeline:extract/,
    )
  })

  it('creates the directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'dir')
    const nestedStore = new LocalArtifactStore(nestedDir)
    await nestedStore.writeZones('test_slug', makeZonesArtifact('test_slug'))

    const filePath = path.join(nestedDir, 'test_slug', 'test_slug_zones.json')
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('overwrites an existing zones artifact on re-write', async () => {
    await store.writeZones('fairfax_va', makeZonesArtifact('fairfax_va'))

    const updated = makeZonesArtifact('fairfax_va')
    updated.zones[0].zone_name = 'Updated Residential'
    await store.writeZones('fairfax_va', updated)

    const read = await store.readZones('fairfax_va')
    expect(read.zones[0].zone_name).toBe('Updated Residential')
  })
})
