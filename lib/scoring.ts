export interface SubScores {
  dci: number;   // Density Constraint Index (0–100)
  dcoi: number;  // Development Cost Impact (0–100)
  pci: number;   // Permitting Complexity Indicator (0–100)
  crp: number;   // Comparative Restrictiveness Percentile (0–100)
}

/**
 * Compute composite Regulatory Impact Score.
 * RIS = 0.30×DCI + 0.25×DCOI + 0.20×PCI + 0.25×CRP
 * Returns a value in [0, 100] rounded to the nearest integer.
 */
export function computeRIS(subScores: SubScores): number {
  const { dci, dcoi, pci, crp } = subScores;
  const raw = 0.30 * dci + 0.25 * dcoi + 0.20 * pci + 0.25 * crp;
  return Math.round(raw);
}
