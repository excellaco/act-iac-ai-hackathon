import { computeRIS } from './scoring';

export type ConfidenceTier = 'High' | 'Medium' | 'Low';

export interface SubScoreDetail {
  score: number;
  confidence: ConfidenceTier;
  source: string;
}

export interface JurisdictionData {
  id: string;
  name: string;
  state: string;
  ris: number;
  subScores: {
    dci: SubScoreDetail;
    dcoi: SubScoreDetail;
    pci: SubScoreDetail;
    crp: SubScoreDetail;
  };
}

const fairfax: JurisdictionData = {
  id: 'fairfax-va',
  name: 'Fairfax County',
  state: 'VA',
  ris: computeRIS({ dci: 75, dcoi: 70, pci: 65, crp: 80 }),
  subScores: {
    dci: { score: 75, confidence: 'High', source: 'Municode zoning code, extracted Mar 2025' },
    dcoi: { score: 70, confidence: 'High', source: 'BLS OES + BEA Regional Price Parities, 2024' },
    pci: { score: 65, confidence: 'Medium', source: 'U.S. Census Building Permits Survey, 2023' },
    crp: { score: 80, confidence: 'High', source: 'Peer comparison set (3 real + 7 illustrative jurisdictions)' },
  },
};

const arlington: JurisdictionData = {
  id: 'arlington-va',
  name: 'Arlington County',
  state: 'VA',
  ris: computeRIS({ dci: 40, dcoi: 50, pci: 35, crp: 45 }),
  subScores: {
    dci: { score: 40, confidence: 'High', source: 'Municode zoning code, extracted Mar 2025' },
    dcoi: { score: 50, confidence: 'High', source: 'BLS OES + BEA Regional Price Parities, 2024' },
    pci: { score: 35, confidence: 'High', source: 'U.S. Census Building Permits Survey, 2023' },
    crp: { score: 45, confidence: 'High', source: 'Peer comparison set (3 real + 7 illustrative jurisdictions)' },
  },
};

const loudoun: JurisdictionData = {
  id: 'loudoun-va',
  name: 'Loudoun County',
  state: 'VA',
  ris: computeRIS({ dci: 80, dcoi: 55, pci: 60, crp: 60 }),
  subScores: {
    dci: { score: 80, confidence: 'High', source: 'Municode zoning code, extracted Mar 2025' },
    dcoi: { score: 55, confidence: 'Medium', source: 'BLS OES + BEA Regional Price Parities, 2024' },
    pci: { score: 60, confidence: 'Medium', source: 'U.S. Census Building Permits Survey, 2023' },
    crp: { score: 60, confidence: 'High', source: 'Peer comparison set (3 real + 7 illustrative jurisdictions)' },
  },
};

export const JURISDICTIONS: JurisdictionData[] = [fairfax, arlington, loudoun];

// Source labels used in the score panel. The DB doesn't store per-sub-score
// attribution yet, so we map them here until the extraction pipeline provides it.
const REAL_SOURCES = {
  dci:  'Municode zoning code, extracted Mar 2025',
  dcoi: 'BLS OES + BEA Regional Price Parities, 2024',
  pci:  'U.S. Census Building Permits Survey, 2023',
  crp:  'Peer comparison set (3 real + 7 illustrative jurisdictions)',
}

const SYNTHETIC_SOURCE = 'Illustrative data — not from official sources'

/**
 * Converts a /api/jurisdictions/[id]/score response into the JurisdictionData
 * shape expected by ScorePanel.
 */
export function scoreResponseToJurisdictionData(
  apiResponse: {
    jurisdiction: { id: string; name: string; state: string; dataType: string }
    score: { risComposite: string; dci: string; dcoi: string; pci: string; crp: string } | null
  }
): JurisdictionData | null {
  const { jurisdiction, score } = apiResponse
  if (!score) return null

  const isSynthetic = jurisdiction.dataType === 'synthetic'
  const sources = isSynthetic
    ? { dci: SYNTHETIC_SOURCE, dcoi: SYNTHETIC_SOURCE, pci: SYNTHETIC_SOURCE, crp: SYNTHETIC_SOURCE }
    : REAL_SOURCES

  return {
    id: jurisdiction.id,
    name: jurisdiction.name,
    state: jurisdiction.state,
    ris: Math.round(parseFloat(score.risComposite)),
    subScores: {
      dci:  { score: Math.round(parseFloat(score.dci)),  confidence: 'High', source: sources.dci },
      dcoi: { score: Math.round(parseFloat(score.dcoi)), confidence: 'High', source: sources.dcoi },
      pci:  { score: Math.round(parseFloat(score.pci)),  confidence: 'High', source: sources.pci },
      crp:  { score: Math.round(parseFloat(score.crp)),  confidence: 'High', source: sources.crp },
    },
  }
}
