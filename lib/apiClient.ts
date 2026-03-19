// Types matching the API response shapes from /api/jurisdictions and /api/jurisdictions/[id]/score

export interface JurisdictionSummary {
  id: string
  name: string
  state: string
  displayName: string
  dataType: 'real' | 'synthetic'
  risComposite: string | null
}

export interface ScoreResponse {
  jurisdiction: {
    id: string
    name: string
    state: string
    slug: string
    displayName: string
    dataType: 'real' | 'synthetic'
  }
  score: {
    risComposite: string
    dci: string
    dcoi: string
    pci: string
    crp: string
    scoredAt: string
  } | null
  extractedFields: Array<{
    fieldName: string
    fieldValue: string | null
    unit: string | null
    confidence: 'high' | 'medium' | 'low'
    sourceDocument: string | null
  }>
  feasibility: {
    maxUnitsPerAcre: string | null
    parkingFootprintPct: string | null
    estimatedCostPerUnit: string | null
    fmr2br: string | null
  } | null
  marketData: {
    fmr2br: string | null
    permits5plus: number | null
    totalPermits: number | null
  } | null
}

export async function fetchJurisdictions(): Promise<JurisdictionSummary[]> {
  const res = await fetch('/api/jurisdictions')
  if (!res.ok) throw new Error('Failed to fetch jurisdictions')
  return res.json()
}

export async function fetchScore(id: string): Promise<ScoreResponse> {
  const res = await fetch(`/api/jurisdictions/${id}/score`)
  if (!res.ok) throw new Error('Failed to fetch score')
  return res.json()
}
