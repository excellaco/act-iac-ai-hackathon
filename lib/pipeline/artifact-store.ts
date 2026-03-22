/**
 * E0-8: Artifact storage — read/write extraction artifacts.
 *
 * Two implementations:
 *   GcsArtifactStore  — production; reads/writes gs://{bucket}/zoning/{slug}/extractions/latest.json
 *   LocalArtifactStore — development/synthetic; reads/writes data/extractions/{slug}.json
 *
 * Selection follows the same RAW_DATA_BUCKET env var convention as the PDF fetchers.
 */

import { Storage } from '@google-cloud/storage'
import fs from 'fs/promises'
import path from 'path'
import { ExtractionArtifact, ParsedPagesArtifact } from './artifact'

// ─── interface ────────────────────────────────────────────────────────────────

export interface ArtifactStore {
  read(slug: string): Promise<ExtractionArtifact>
  write(slug: string, artifact: ExtractionArtifact): Promise<void>
  readPages(slug: string): Promise<ParsedPagesArtifact>
  writePages(slug: string, pages: ParsedPagesArtifact): Promise<void>
}

// ─── local implementation ─────────────────────────────────────────────────────

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly dir: string = 'data/extractions') {}

  async read(slug: string): Promise<ExtractionArtifact> {
    const filePath = path.join(this.dir, `${slug}.json`)
    try {
      const contents = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(contents) as ExtractionArtifact
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `No artifact found at ${filePath} — run \`npm run pipeline:extract ${slug}\` first`,
        )
      }
      throw err
    }
  }

  async write(slug: string, artifact: ExtractionArtifact): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const filePath = path.join(this.dir, `${slug}.json`)
    await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), 'utf-8')
  }

  async readPages(slug: string): Promise<ParsedPagesArtifact> {
    const filePath = path.join(this.dir, `${slug}.pages.json`)
    try {
      const contents = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(contents) as ParsedPagesArtifact
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `No parsed-pages artifact at ${filePath} — run \`npm run pipeline:extract ${slug}\` first`,
        )
      }
      throw err
    }
  }

  async writePages(slug: string, pages: ParsedPagesArtifact): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const filePath = path.join(this.dir, `${slug}.pages.json`)
    await fs.writeFile(filePath, JSON.stringify(pages, null, 2), 'utf-8')
  }
}

// ─── GCS implementation ───────────────────────────────────────────────────────

export class GcsArtifactStore implements ArtifactStore {
  constructor(private readonly bucket: string) {}

  private gcsPath(slug: string): string {
    return `zoning/${slug}/extractions/latest.json`
  }

  async read(slug: string): Promise<ExtractionArtifact> {
    const storage = new Storage()
    const file = storage.bucket(this.bucket).file(this.gcsPath(slug))
    try {
      const [contents] = await file.download()
      return JSON.parse(contents.toString('utf-8')) as ExtractionArtifact
    } catch (err) {
      if ((err as { code?: number }).code === 404) {
        throw new Error(
          `No artifact found at gs://${this.bucket}/${this.gcsPath(slug)} — run \`npm run pipeline:extract ${slug}\` first`,
        )
      }
      throw err
    }
  }

  async write(slug: string, artifact: ExtractionArtifact): Promise<void> {
    const storage = new Storage()
    const file = storage.bucket(this.bucket).file(this.gcsPath(slug))
    await file.save(JSON.stringify(artifact, null, 2), { contentType: 'application/json' })
  }

  private gcsPagesPath(slug: string): string {
    return `zoning/${slug}/extractions/parsed-pages.json`
  }

  async readPages(slug: string): Promise<ParsedPagesArtifact> {
    const storage = new Storage()
    const file = storage.bucket(this.bucket).file(this.gcsPagesPath(slug))
    try {
      const [contents] = await file.download()
      return JSON.parse(contents.toString('utf-8')) as ParsedPagesArtifact
    } catch (err) {
      if ((err as { code?: number }).code === 404) {
        throw new Error(
          `No parsed-pages artifact at gs://${this.bucket}/${this.gcsPagesPath(slug)} — run \`npm run pipeline:extract ${slug}\` first`,
        )
      }
      throw err
    }
  }

  async writePages(slug: string, pages: ParsedPagesArtifact): Promise<void> {
    const storage = new Storage()
    const file = storage.bucket(this.bucket).file(this.gcsPagesPath(slug))
    await file.save(JSON.stringify(pages, null, 2), { contentType: 'application/json' })
  }
}

// ─── factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate ArtifactStore based on environment.
 * Mirrors the fetcher selection logic: GCS when RAW_DATA_BUCKET is set, local otherwise.
 */
export function buildArtifactStore(): ArtifactStore {
  const bucket = process.env.RAW_DATA_BUCKET
  return bucket ? new GcsArtifactStore(bucket) : new LocalArtifactStore()
}
