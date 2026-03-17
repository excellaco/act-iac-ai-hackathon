'use client';

import { useEffect } from 'react';
import styles from './MethodologyModal.module.css';

interface Props {
  onClose: () => void;
}

export default function MethodologyModal({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="methodology-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="methodology-title" className={styles.title}>About the Regulatory Impact Score</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>What is the RIS?</h3>
            <p>
              The Regulatory Impact Score (RIS) is a composite index from 0 to 100 that measures how
              restrictive a jurisdiction's zoning and land-use regulations are relative to multifamily
              housing development. Higher scores indicate greater regulatory constraint.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Sub-score weights</h3>
            <p>The RIS is a weighted sum of four sub-scores:</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Sub-score</th>
                  <th>Weight</th>
                  <th>What it measures</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Density Constraint Index (DCI)</td>
                  <td>30%</td>
                  <td>Restrictions on lot size, height, density, and setbacks</td>
                </tr>
                <tr>
                  <td>Development Cost Impact (DCOI)</td>
                  <td>25%</td>
                  <td>Cost burden from parking requirements and regional construction costs</td>
                </tr>
                <tr>
                  <td>Permitting Complexity Indicator (PCI)</td>
                  <td>20%</td>
                  <td>Permit volume and whether multifamily housing requires discretionary approval</td>
                </tr>
                <tr>
                  <td>Comparative Restrictiveness (CRP)</td>
                  <td>25%</td>
                  <td>Percentile rank within a peer comparison set of similar jurisdictions</td>
                </tr>
              </tbody>
            </table>
            <p className={styles.formula}>
              RIS = 0.30 × DCI + 0.25 × DCOI + 0.20 × PCI + 0.25 × CRP
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Normalization</h3>
            <p>
              Each sub-score is normalized to a 0–100 scale before the weighted sum is applied.
              Raw regulatory values (e.g. minimum lot size in square feet) are mapped to a
              0–100 restrictiveness scale using jurisdiction-specific benchmarks and national
              reference distributions from ACS, FMR, and HUD data.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Confidence tiers</h3>
            <p>
              Each extracted field carries a confidence tier based on how clearly the value
              appeared in the zoning document:
            </p>
            <ul className={styles.list}>
              <li><strong>High</strong> — value extracted directly from unambiguous zoning text</li>
              <li><strong>Medium</strong> — value required interpretation or inference</li>
              <li><strong>Low</strong> — value could not be reliably extracted; an estimate or default was used</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Limitations</h3>
            <ul className={styles.list}>
              <li>Scores reflect zoning text as written and may not capture informal administrative practices.</li>
              <li>Extraction accuracy depends on the quality and structure of the source PDF.</li>
              <li>The peer comparison set (CRP) is limited to the jurisdictions currently in the dataset.</li>
              <li>The RIS is descriptive, not prescriptive — it does not recommend any policy position.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
