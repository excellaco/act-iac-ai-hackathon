/**
 * Artifact storage — v2 (pipeline refactor)
 *
 * Two implementations:
 *   GcsArtifactStore  — used by Stage 1 (zones) and Stage 2 (extract) in production
 *                       writes to gs://{bucket}/zoning/{slug}/artifacts/
 *   LocalArtifactStore — used by Stage 3 (load) and Stage 4 (score) in all environments,
 *                        and by all stages in local development
 *                        reads/writes data/artifacts/{slug}/
 *
 * The repo is the source of truth. GCS is ephemeral working storage during cloud
 * extraction runs. The sync script (npm run artifacts:sync) pulls GCS artifacts
 * back to data/artifacts/ so load and score always read from the checked-out repo.
 *
 * buildExtractArtifactStore() — for Stage 1 + Stage 2 (write to GCS in prod)
 * buildLoadArtifactStore()    — for Stage 3 + Stage 4 (always read from repo)
 */

import { Storage } from '@google-cloud/storage'
import fs from 'fs/promises'
import path from 'path'
import {
  ExtractionArtifact,
  ParsedPagesArtifact,
  ScoresArtifact,
  ZoneFieldsArtifact,
  ZonesArtifact,
  slugifyZoneCode,
} from './artifact'

// ─── interface ────────────────────────────────────────────────────────────────

export interface ArtifactStore {
  // ── v2 methods ──────────────────────────────────────────────────────────────
  readZones(slug: string): Promise<ZonesArtifact>
  writeZones(slug: string, artifact: ZonesArtifact): Promise<void>

  readZoneFields(slug: string, zoneCode: string): Promise<ZoneFieldsArtifact>
  writeZoneFields(slug: string, zoneCode: string, artifact: ZoneFieldsArtifact): Promise<void>

  readScores(slug: string): Promise<ScoresArtifact>
  writeScores(slug: string, artifact: ScoresArtifact): Promise<void>

  // ── shared (pages artifact unchanged) ───────────────────────────────────────
  readPages(slug: string): Promise<ParsedPagesArtifact>
  writePages(slug: string, pages: ParsedPagesArtifact): Promise<void>

  // ── legacy (retained for migration period) ──────────────────────────────────
  read(slug: string): Promise<ExtractionArtifact>
  write(slug: string, artifact: ExtractionArtifact): Promise<void>
}

// ─── local implementation ─────────────────────────────────────────────────────

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly dir: string = 'data/artifacts') {}

  private slugDir(slug: string): string {
    return path.join(this.dir, slug)
  }

  private async ensureDir(slug: string): Promise<void> {
    await fs.mkdir(this.slugDir(slug), { recursive: true })
  }

  private async readJson<T>(filePath: string, notFoundMsg: string): Promise<T> {
    try {
      const contents = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(contents) as T
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(notFoundMsg)
      }
      throw err
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  // ── v2 ──────────────────────────────────────────────────────────────────────

  async readZones(slug: string): Promise<ZonesArtifact> {
    const filePath = path.join(this.slugDir(slug), `${slug}_zones.json`)
    return this.readJson<ZonesArtifact>(
      filePath,
      `No zones artifact at ${filePath} — run \`npm run pipeline:zones ${slug}\` first`,
    )
  }

  async writeZones(slug: string, artifact: ZonesArtifact): Promise<void> {
    await this.ensureDir(slug)
    const filePath = path.join(this.slugDir(slug), `${slug}_zones.json`)
    await this.writeJson(filePath, artifact)
  }

  async readZoneFields(slug: string, zoneCode: string): Promise<ZoneFieldsArtifact> {
    const zoneSlug = slugifyZoneCode(zoneCode)
    const filePath = path.join(this.slugDir(slug), `${slug}_${zoneSlug}_fields.json`)
    return this.readJson<ZoneFieldsArtifact>(
      filePath,
      `No fields artifact at ${filePath} — run \`npm run pipeline:extract ${slug} ${zoneCode}\` first`,
    )
  }

  async writeZoneFields(slug: string, zoneCode: string, artifact: ZoneFieldsArtifact): Promise<void> {
    await this.ensureDir(slug)
    const zoneSlug = slugifyZoneCode(zoneCode)
    const filePath = path.join(this.slugDir(slug), `${slug}_${zoneSlug}_fields.json`)
    await this.writeJson(filePath, artifact)
  }

  async readScores(slug: string): Promise<ScoresArtifact> {
    const filePath = path.join(this.slugDir(slug), `${slug}_scores.json`)
    return this.readJson<ScoresArtifact>(
      filePath,
      `No scores artifact at ${filePath} — run \`npm run pipeline:score ${slug}\` first`,
    )
  }

  async writeScores(slug: string, artifact: ScoresArtifact): Promise<void> {
    await this.ensureDir(slug)
    const filePath = path.join(this.slugDir(slug), `${slug}_scores.json`)
    await this.writeJson(filePath, artifact)
  }

  async readPages(slug: string): Promise<ParsedPagesArtifact> {
    const filePath = path.join(this.slugDir(slug), `${slug}_pages.json`)
    return this.readJson<ParsedPagesArtifact>(
      filePath,
      `No parsed-pages artifact at ${filePath} — run \`npm run pipeline:zones ${slug}\` first`,
    )
  }

  async writePages(slug: string, pages: ParsedPagesArtifact): Promise<void> {
    await this.ensureDir(slug)
    const filePath = path.join(this.slugDir(slug), `${slug}_pages.json`)
    await this.writeJson(filePath, pages)
  }

  // ── legacy ───────────────────────────────────────────────────────────────────

  async read(slug: string): Promise<ExtractionArtifact> {
    const filePath = path.join('data/extractions', `${slug}.json`)
    return this.readJson<ExtractionArtifact>(
      filePath,
      `No legacy artifact at ${filePath}`,
    )
  }

  async write(slug: string, artifact: ExtractionArtifact): Promise<void> {
    await fs.mkdir('data/extractions', { recursive: true })
    const filePath = path.join('data/extractions', `${slug}.json`)
    await this.writeJson(filePath, artifact)
  }
}

// ─── GCS implementation ───────────────────────────────────────────────────────

export class GcsArtifactStore implements ArtifactStore {
  constructor(private readonly bucket: string) {}

  private artifactsPath(slug: string, filename: string): string {
    return `zoning/${slug}/artifacts/${filename}`
  }

  private async readGcs<T>(gcsPath: string, notFoundMsg: string): Promise<T> {
    const storage = new Storage()
    const file = storage.bucket(this.bucket).file(gcsPath)
    try {
      const [contents] = await file.download()
      return JSON.parse(contents.toString('utf-8')) as T
    } catch (err) {
      if ((err as { code?: number }).code === 404) {
        throw new Error(notFoundMsg)
      }
      throw err
    }
  }

  private async writeGcs(gcsPath: string, data: unknown): Promise<void> {
    const storage = new Storage()
    const file = storage.bucket(this.bucket).file(gcsPath)
    await file.save(JSON.stringify(data, null, 2), { contentType: 'application/json' })
  }

  // ── v2 ──────────────────────────────────────────────────────────────────────

  async readZones(slug: string): Promise<ZonesArtifact> {
    const p = this.artifactsPath(slug, `${slug}_zones.json`)
    return this.readGcs<ZonesArtifact>(p, `No zones artifact at gs://${this.bucket}/${p}`)
  }

  async writeZones(slug: string, artifact: ZonesArtifact): Promise<void> {
    await this.writeGcs(this.artifactsPath(slug, `${slug}_zones.json`), artifact)
  }

  async readZoneFields(slug: string, zoneCode: string): Promise<ZoneFieldsArtifact> {
    const zoneSlug = slugifyZoneCode(zoneCode)
    const p = this.artifactsPath(slug, `${slug}_${zoneSlug}_fields.json`)
    return this.readGcs<ZoneFieldsArtifact>(p, `No fields artifact at gs://${this.bucket}/${p}`)
  }

  async writeZoneFields(slug: string, zoneCode: string, artifact: ZoneFieldsArtifact): Promise<void> {
    const zoneSlug = slugifyZoneCode(zoneCode)
    await this.writeGcs(this.artifactsPath(slug, `${slug}_${zoneSlug}_fields.json`), artifact)
  }

  async readScores(slug: string): Promise<ScoresArtifact> {
    const p = this.artifactsPath(slug, `${slug}_scores.json`)
    return this.readGcs<ScoresArtifact>(p, `No scores artifact at gs://${this.bucket}/${p}`)
  }

  async writeScores(slug: string, artifact: ScoresArtifact): Promise<void> {
    await this.writeGcs(this.artifactsPath(slug, `${slug}_scores.json`), artifact)
  }

  async readPages(slug: string): Promise<ParsedPagesArtifact> {
    const p = this.artifactsPath(slug, `${slug}_pages.json`)
    return this.readGcs<ParsedPagesArtifact>(p, `No parsed-pages artifact at gs://${this.bucket}/${p}`)
  }

  async writePages(slug: string, pages: ParsedPagesArtifact): Promise<void> {
    await this.writeGcs(this.artifactsPath(slug, `${slug}_pages.json`), pages)
  }

  // ── legacy ───────────────────────────────────────────────────────────────────

  async read(slug: string): Promise<ExtractionArtifact> {
    const p = `zoning/${slug}/extractions/latest.json`
    return this.readGcs<ExtractionArtifact>(p, `No legacy artifact at gs://${this.bucket}/${p}`)
  }

  async write(slug: string, artifact: ExtractionArtifact): Promise<void> {
    await this.writeGcs(`zoning/${slug}/extractions/latest.json`, artifact)
  }
}

// ─── factories ────────────────────────────────────────────────────────────────

/**
 * For Stage 1 (zones) and Stage 2 (extract):
 * Uses GcsArtifactStore when RAW_DATA_BUCKET is set (production cloud runs),
 * falls back to LocalArtifactStore for local development.
 */
export function buildExtractArtifactStore(): ArtifactStore {
  const bucket = process.env.RAW_DATA_BUCKET
  return bucket ? new GcsArtifactStore(bucket) : new LocalArtifactStore()
}

/**
 * For Stage 3 (load) and Stage 4 (score):
 * Always uses LocalArtifactStore pointed at data/artifacts/ —
 * the repo is the source of truth; load/score never read from GCS directly.
 */
export function buildLoadArtifactStore(): ArtifactStore {
  return new LocalArtifactStore()
}
