'use client';

import type { FeasibilityOutputs, RentFeasibility } from '../../lib/feasibility';
import styles from './FeasibilityPanel.module.css';

interface Props {
  feasibility: FeasibilityOutputs;
}

function feasibilityColor(label: RentFeasibility): string {
  if (label === 'Feasible')   return '#16a34a';
  if (label === 'Marginal')   return '#d97706';
  return '#dc2626';
}

function feasibilityBg(label: RentFeasibility): string {
  if (label === 'Feasible')   return '#f0fdf4';
  if (label === 'Marginal')   return '#fffbeb';
  return '#fef2f2';
}

export default function FeasibilityPanel({ feasibility }: Props) {
  const {
    maxUnitsPerAcre,
    parkingFootprintPct,
    estimatedCostPerUnit,
    monthlyCarryingCost,
    rentFeasibility,
    fmr2br,
  } = feasibility;

  const fColor = feasibilityColor(rentFeasibility);
  const fBg    = feasibilityBg(rentFeasibility);

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Development Feasibility</h3>

      {/* E4-1: Max unit yield */}
      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardValue}>{maxUnitsPerAcre}</span>
          <span className={styles.cardUnit}>units/acre</span>
          <span className={styles.cardLabel}>Max Unit Yield</span>
          <span className={styles.cardNote}>Density limit (multifamily zone)</span>
        </div>

        {/* E4-2: Parking footprint */}
        <div className={styles.card}>
          <span className={styles.cardValue}>{parkingFootprintPct}%</span>
          <span className={styles.cardUnit}>of lot</span>
          <span className={styles.cardLabel}>Parking Footprint</span>
          <span className={styles.cardNote}>Required stalls × 330 sqft/stall</span>
        </div>

        {/* E4-3: Cost per unit */}
        <div className={styles.card}>
          <span className={styles.cardValue}>
            ${(estimatedCostPerUnit / 1000).toFixed(0)}K
          </span>
          <span className={styles.cardUnit}>per unit</span>
          <span className={styles.cardLabel}>Est. Construction Cost</span>
          <span className={styles.cardNote}>Base cost × regional multiplier + parking</span>
        </div>

        {/* E4-4: Rent feasibility */}
        <div className={styles.card} style={{ background: fBg, borderColor: fColor + '40' }}>
          <span className={styles.cardValue} style={{ color: fColor }}>
            {rentFeasibility}
          </span>
          <span className={styles.cardUnit}>rent feasibility</span>
          <span className={styles.cardLabel}>Market Support</span>
          <span className={styles.cardNote}>
            ${monthlyCarryingCost.toLocaleString()}/mo carrying vs. ${fmr2br.toLocaleString()} FMR 2BR
          </span>
        </div>
      </div>

      <p className={styles.source}>
        <span className={styles.sourceLabel}>Sources:</span>{' '}
        BLS OES 2024 (construction cost) · BEA Regional Price Parities 2022 · HUD FY2025 FMR
      </p>
    </div>
  );
}
