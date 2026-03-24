/**
 * Phase 6: Artifact GCS sync script
 *
 * Pulls artifact files from GCS down to data/artifacts/{slug}/.
 * Used after a cloud extraction run to bring artifacts back to the repo.
 *
 * Usage:
 *   npm run artifacts:sync <jurisdiction-slug>
 *
 * Never overwrites files that have "approved": true — those are human-verified
 * and must not be clobbered by a cloud run.
 */

import { Storage } from '@google-cloud/storage'
import fs from 'fs/promises'
import path from 'path'

const LOCAL_ARTIFACTS_DIR = 'data/artifacts'

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: npm run artifacts:sync <jurisdiction-slug>')
    console.error('Example: npm run artifacts:sync arlington')
    process.exit(1)
  }

  const bucket = process.env.RAW_DATA_BUCKET
  if (!bucket) {
    console.error(
      'Error: RAW_DATA_BUCKET environment variable is not set.\n' +
        'Set it to the GCS bucket name used for extraction runs (e.g. parcela-490518-raw-data).',
    )
    process.exit(1)
  }

  const gcsPrefix = `zoning/${slug}/artifacts/`
  const localDir = path.join(LOCAL_ARTIFACTS_DIR, slug)

  console.log(`Syncing gs://${bucket}/${gcsPrefix} → ${localDir}/`)

  const storage = new Storage()
  const [files] = await storage.bucket(bucket).getFiles({ prefix: gcsPrefix })

  if (files.length === 0) {
    console.log(`No files found at gs://${bucket}/${gcsPrefix}`)
    return
  }

  // Ensure local directory exists
  await fs.mkdir(localDir, { recursive: true })

  let updated = 0
  let created = 0
  let skippedApproved = 0
  let unchanged = 0

  for (const file of files) {
    const filename = path.basename(file.name)

    // Skip pages artifacts — these are internal and gitignored
    if (filename.endsWith('_pages.json')) {
      continue
    }

    const localPath = path.join(localDir, filename)

    // Check if a local copy exists
    let localExists = false
    let localContent: string | null = null
    try {
      localContent = await fs.readFile(localPath, 'utf-8')
      localExists = true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err
      }
    }

    // If local copy exists and is approved — skip with warning
    if (localExists && localContent !== null) {
      let parsed: unknown
      try {
        parsed = JSON.parse(localContent)
      } catch {
        // Unparseable local file — treat as non-approved and overwrite
        parsed = {}
      }
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'approved' in (parsed as Record<string, unknown>) &&
        (parsed as Record<string, unknown>).approved === true
      ) {
        console.warn(`  SKIP (approved)  ${filename}  — local copy is approved, will not overwrite`)
        skippedApproved++
        continue
      }
    }

    // Download from GCS
    const [gcsContent] = await file.download()
    const gcsText = gcsContent.toString('utf-8')

    // Check if unchanged
    if (localExists && localContent === gcsText) {
      console.log(`  unchanged        ${filename}`)
      unchanged++
      continue
    }

    // Write to local
    await fs.writeFile(localPath, gcsText, 'utf-8')

    if (localExists) {
      console.log(`  updated          ${filename}`)
      updated++
    } else {
      console.log(`  created          ${filename}`)
      created++
    }
  }

  console.log('')
  console.log('Sync complete:')
  console.log(`  created:          ${created}`)
  console.log(`  updated:          ${updated}`)
  console.log(`  unchanged:        ${unchanged}`)
  console.log(`  skipped (approved): ${skippedApproved}`)
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
