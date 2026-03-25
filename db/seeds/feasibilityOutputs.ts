/**
 * E4-1 / E4-2 / E4-3 / E4-4: Feasibility outputs seed
 *
 * Computes and stores feasibility outputs for all real demo jurisdictions.
 * Values are derived from regulatory field baselines in lib/mockData.ts
 * and market data (HUD FMR) from the market_data table.
 *
 * Run after: db:seed (jurisdictions) and db:seed:market
 *   tsx -r dotenv/config db/seeds/feasibilityOutputs.ts
 */

import { db } from '../client'
import { jurisdictions, marketData, feasibilityOutputs } from '../schema'
import { eq } from 'drizzle-orm'
import { computeFeasibility } from '../../lib/feasibility'
import { REGIONAL_MULTIPLIERS, DEFAULT_REGIONAL_MULTIPLIER } from '../../lib/scoringEngine'

// Regulatory field baselines per jurisdiction (multifamily zone values)
const FIELD_BASELINES: Record<string, {
  densityLimitUpa: number
  parkingMinSpacesPerUnit: number
  heightLimitFt: number
}> = {
  // Real demo jurisdictions (slugs from db/seeds/jurisdictions.ts)
  'fairfax_va':                { densityLimitUpa: 12,  parkingMinSpacesPerUnit: 2.0,  heightLimitFt: 45  },
  'arlington_va':              { densityLimitUpa: 72,  parkingMinSpacesPerUnit: 0.5,  heightLimitFt: 125 },
  'loudoun_va':                { densityLimitUpa: 6,   parkingMinSpacesPerUnit: 2.0,  heightLimitFt: 35  },
  // Synthetic peer jurisdictions (slugs from db/seeds/syntheticJurisdictions.ts)
  'montgomery-county-md':      { densityLimitUpa: 40,  parkingMinSpacesPerUnit: 1.5,  heightLimitFt: 65  },
  "prince-george's-county-md": { densityLimitUpa: 25,  parkingMinSpacesPerUnit: 1.5,  heightLimitFt: 50  },
  'howard-county-md':          { densityLimitUpa: 30,  parkingMinSpacesPerUnit: 1.5,  heightLimitFt: 55  },
  'alexandria-city-va':        { densityLimitUpa: 80,  parkingMinSpacesPerUnit: 0.75, heightLimitFt: 120 },
  'prince-william-county-va':  { densityLimitUpa: 15,  parkingMinSpacesPerUnit: 2.0,  heightLimitFt: 45  },
  'stafford-county-va':        { densityLimitUpa: 5,   parkingMinSpacesPerUnit: 2.5,  heightLimitFt: 35  },
  'frederick-county-va':       { densityLimitUpa: 8,   parkingMinSpacesPerUnit: 2.0,  heightLimitFt: 40  },
}

const DEFAULT_FMR = 1800

async function seedFeasibilityOutputs() {
  console.log('Seeding feasibility outputs...')

  const allJurisdictions = await db.select().from(jurisdictions)

  for (const j of allJurisdictions) {
    const slug = j.slug
    const baseline = FIELD_BASELINES[slug]
    if (!baseline) {
      console.warn(`  ⚠ No baseline for ${j.displayName}, skipping`)
      continue
    }

    const market = await db.query.marketData.findFirst({
      where: eq(marketData.jurisdictionId, j.id),
    })

    const fmr2br = market?.fmr2br ? parseFloat(market.fmr2br) : DEFAULT_FMR
    const regionalMultiplier = REGIONAL_MULTIPLIERS[slug] ?? DEFAULT_REGIONAL_MULTIPLIER

    const result = computeFeasibility({
      densityLimitUpa:         baseline.densityLimitUpa,
      parkingMinSpacesPerUnit: baseline.parkingMinSpacesPerUnit,
      heightLimitFt:           baseline.heightLimitFt,
      regionalMultiplier,
      fmr2br,
    })

    // zoneCode defaults to '__avg__' (schema default) for jurisdiction-level rows
    await db
      .insert(feasibilityOutputs)
      .values({
        jurisdictionId:       j.id,
        maxUnitsPerAcre:      result.maxUnitsPerAcre.toString(),
        parkingFootprintPct:  result.parkingFootprintPct.toString(),
        estimatedCostPerUnit: result.estimatedCostPerUnit.toString(),
        regionalCostMultiplier: regionalMultiplier.toString(),
        fmr2br:               fmr2br.toString(),
        rentFeasibilityRatio: (result.requiredRent / fmr2br).toFixed(3),
      })
      .onConflictDoUpdate({
        target: [feasibilityOutputs.jurisdictionId, feasibilityOutputs.zoneCode],
        set: {
          maxUnitsPerAcre:      result.maxUnitsPerAcre.toString(),
          parkingFootprintPct:  result.parkingFootprintPct.toString(),
          estimatedCostPerUnit: result.estimatedCostPerUnit.toString(),
          regionalCostMultiplier: regionalMultiplier.toString(),
          fmr2br:               fmr2br.toString(),
          rentFeasibilityRatio: (result.requiredRent / fmr2br).toFixed(3),
          scoredAt:             new Date(),
        },
      })

    console.log(
      `  ✓ ${j.displayName} — ${result.maxUnitsPerAcre} units/acre, ` +
      `$${result.estimatedCostPerUnit.toLocaleString()}/unit, ` +
      `${result.rentFeasibility}`,
    )
  }

  console.log('Done.')
}

seedFeasibilityOutputs()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1) })
