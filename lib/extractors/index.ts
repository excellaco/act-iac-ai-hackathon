/**
 * E2 / E2-155: LLM extraction — barrel export
 *
 * buildExtractors() returns the full set of FieldExtractor instances for a
 * standard single-zone pipeline run.
 *
 * buildZoneAwareExtractors() returns extractors that implement extractAllZones()
 * for per-zone extraction (E2-155). The pipeline runner calls discoverZones()
 * first, then injects canonical zones via injectCanonicalZones() before running.
 *
 * Setbacks share one Gemini call per chunk via dedicated shared-call objects to
 * avoid triple-calling the API for the same text.
 */

export { MinLotSizeExtractor } from './min-lot-size.extractor'
export { HeightLimitExtractor } from './height-limit.extractor'
export { DensityLimitExtractor } from './density-limit.extractor'
export { ParkingMinExtractor } from './parking-min.extractor'
export { buildSetbackExtractors, SetbackFrontExtractor, SetbackSideExtractor, SetbackRearExtractor } from './setbacks.extractor'
export { DiscretionaryReviewExtractor } from './discretionary-review.extractor'
export { buildMultiZoneSetbackExtractors } from './multi-zone-setbacks.extractor'
export { injectCanonicalZones } from './multi-zone-gemini.extractor'

import { FieldExtractor } from '../pipeline/runner'
import { MinLotSizeExtractor } from './min-lot-size.extractor'
import { HeightLimitExtractor } from './height-limit.extractor'
import { DensityLimitExtractor } from './density-limit.extractor'
import { ParkingMinExtractor } from './parking-min.extractor'
import { buildSetbackExtractors } from './setbacks.extractor'
import { DiscretionaryReviewExtractor } from './discretionary-review.extractor'
import { buildMultiZoneSetbackExtractors } from './multi-zone-setbacks.extractor'

/** Standard single-zone extractors for backward-compatible pipeline runs. */
export function buildExtractors(): FieldExtractor[] {
  return [
    new MinLotSizeExtractor(),
    new HeightLimitExtractor(),
    new DensityLimitExtractor(),
    new ParkingMinExtractor(),
    ...buildSetbackExtractors(),
    new DiscretionaryReviewExtractor(),
  ]
}

/**
 * Zone-aware extractors that implement extractAllZones() (E2-155).
 * These are used by the pipeline runner when multi-zone extraction is enabled.
 * Call injectCanonicalZones(extractors, zones) before running extraction.
 */
export function buildZoneAwareExtractors(): FieldExtractor[] {
  return [
    new MinLotSizeExtractor(),
    new HeightLimitExtractor(),
    new DensityLimitExtractor(),
    new ParkingMinExtractor(),
    ...buildMultiZoneSetbackExtractors(),
    new DiscretionaryReviewExtractor(),
  ]
}
