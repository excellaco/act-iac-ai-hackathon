'use client';

import { useState } from 'react';
import type { JurisdictionSummary } from '../lib/apiClient';
import { fetchScore } from '../lib/apiClient';
import { scoreResponseToJurisdictionData, type JurisdictionData } from '../lib/mockData';
import JurisdictionSearch from './components/JurisdictionSearch';
import ScorePanel from './components/ScorePanel';
import styles from './page.module.css';

export default function Home() {
  const [selected, setSelected] = useState<JurisdictionData | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSelect(jurisdiction: JurisdictionSummary) {
    setLoading(true);
    try {
      const scoreData = await fetchScore(jurisdiction.id);
      setSelected(scoreResponseToJurisdictionData(scoreData));
    } catch (err) {
      console.error('Failed to load score:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.layout}>
      <main className={`${styles.main} ${selected ? styles.mainWithPanel : ''}`}>
        <div className={styles.hero}>
          <h1 className={styles.heading}>Parcela</h1>
          <p className={styles.subheading}>
            Understand the regulatory barriers to housing in your jurisdiction.
          </p>
          <JurisdictionSearch onSelect={handleSelect} />
          {loading && <p className={styles.loading}>Loading score…</p>}
        </div>
      </main>

      {selected && (
        <ScorePanel jurisdiction={selected} />
      )}
    </div>
  );
}
