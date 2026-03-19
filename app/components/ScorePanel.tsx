'use client';

import { useState } from 'react';
import type { JurisdictionData } from '../../lib/mockData';
import ConfidenceBadge from './ConfidenceBadge';
import MethodologyModal from './MethodologyModal';
import styles from './ScorePanel.module.css';

const SUB_SCORE_LABELS: Record<string, { label: string; description: string }> = {
  dci:  { label: 'Density Constraint Index',           description: 'Measures restrictions on lot size, height, density, and setbacks.' },
  dcoi: { label: 'Development Cost Impact',            description: 'Estimates cost burden from parking requirements and regional construction costs.' },
  pci:  { label: 'Permitting Complexity Indicator',    description: 'Reflects permit volume and whether multifamily housing requires discretionary approval.' },
  crp:  { label: 'Comparative Restrictiveness',        description: 'Ranks this jurisdiction within a peer comparison set of 10 jurisdictions.' },
};

function risColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 40) return '#d97706';
  return '#16a34a';
}

function risLabel(score: number): string {
  if (score >= 70) return 'High Restrictiveness';
  if (score >= 40) return 'Moderate Restrictiveness';
  return 'Low Restrictiveness';
}

export default function ScorePanel({ jurisdiction }: { jurisdiction: JurisdictionData }) {
  const { name, state, ris, subScores } = jurisdiction;
  const color = risColor(ris);
  const [showMethodology, setShowMethodology] = useState(false);
  const [whatIfEnabled, setWhatIfEnabled] = useState(false);

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.jurisdictionName}>{name}, {state}</h2>
          <p className={styles.risLabel} style={{ color }}>{risLabel(ris)}</p>
        </div>
        <div className={styles.risScore} style={{ borderColor: color, color }}>
          {ris}
        </div>
      </div>

      <p className={styles.risDescription}>
        Regulatory Impact Score — composite of density, cost, permitting, and peer comparison sub-scores.{' '}
        <button className={styles.methodologyLink} onClick={() => setShowMethodology(true)}>
          About this score
        </button>
      </p>

      {/* E8-1: What-If Simulation toggle */}
      <div className={styles.whatIfSection}>
        <div className={styles.whatIfHeader}>
          <div className={styles.whatIfLabels}>
            <span className={styles.whatIfTitle}>What-If Simulation</span>
            <span className={styles.whatIfSubtitle}>
              Adjust regulatory parameters to model policy changes
            </span>
          </div>
          <label className={styles.toggleLabel} aria-label="Toggle What-If Simulation">
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={whatIfEnabled}
              onChange={(e) => setWhatIfEnabled(e.target.checked)}
            />
            <span className={styles.toggleTrack}>
              <span className={styles.toggleThumb} />
            </span>
          </label>
        </div>
        {whatIfEnabled && (
          <p className={styles.whatIfPlaceholder}>
            Simulation controls coming soon — adjust sliders below to model policy changes
          </p>
        )}
      </div>

      <div className={styles.accordions}>
        {(Object.entries(subScores) as [keyof typeof subScores, typeof subScores[keyof typeof subScores]][]).map(([key, detail]) => {
          const { label, description } = SUB_SCORE_LABELS[key];
          return (
            <details key={key} className={styles.accordion}>
              <summary className={styles.accordionSummary}>
                <span className={styles.summaryLeft}>
                  <span className={styles.subLabel}>{label}</span>
                  <ConfidenceBadge tier={detail.confidence} />
                </span>
                <span className={styles.subScore} style={{ color: risColor(detail.score) }}>
                  {detail.score}
                </span>
              </summary>
              <div className={styles.accordionBody}>
                <p className={styles.subDescription}>{description}</p>
                <p className={styles.source}>
                  <span className={styles.sourceLabel}>Source:</span> {detail.source}
                </p>
              </div>
            </details>
          );
        })}
      </div>

      <p className={styles.disclaimer}>
        This score measures regulatory constraint and does not recommend policy positions.
      </p>

      {showMethodology && (
        <MethodologyModal onClose={() => setShowMethodology(false)} />
      )}
    </aside>
  );
}
