/**
 * E2: LLM extraction — barrel export
 *
 * buildExtractors() returns the full set of FieldExtractor instances for a
 * pipeline run.  Pass these as options.extractors to runPipeline() (E0-1).
 *
 * Setbacks share one Gemini call per chunk via SetbacksGeminiCall to avoid
 * triple-calling the API for the same text.
 */

export { MinLotSizeExtractor } from './min-lot-size.extractor'
export { HeightLimitExtractor } from './height-limit.extractor'
export { DensityLimitExtractor } from './density-limit.extractor'
export { ParkingMinExtractor } from './parking-min.extractor'
export { buildSetbackExtractors, SetbackFrontExtractor, SetbackSideExtractor, SetbackRearExtractor } from './setbacks.extractor'
export { DiscretionaryReviewExtractor } from './discretionary-review.extractor'

import { FieldExtractor } from '../pipeline/runner'
import { MinLotSizeExtractor } from './min-lot-size.extractor'
import { HeightLimitExtractor } from './height-limit.extractor'
import { DensityLimitExtractor } from './density-limit.extractor'
import { ParkingMinExtractor } from './parking-min.extractor'
import { buildSetbackExtractors } from './setbacks.extractor'
import { DiscretionaryReviewExtractor } from './discretionary-review.extractor'

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
