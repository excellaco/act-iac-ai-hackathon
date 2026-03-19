'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { JurisdictionSummary } from '../lib/apiClient';
import { fetchScore } from '../lib/apiClient';
import { scoreResponseToJurisdictionData, type JurisdictionData } from '../lib/mockData';
import JurisdictionSearch from './components/JurisdictionSearch';
import ScorePanel from './components/ScorePanel';
import CompareView from './components/CompareView';
import styles from './page.module.css';

// Leaflet requires the browser's window object — must be dynamically imported with ssr: false
const ChoroplethMap = dynamic(() => import('./components/ChoroplethMap'), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder} />,
});

export default function Home() {
  const [selected, setSelected] = useState<JurisdictionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  async function handleSelect(jurisdiction: JurisdictionSummary) {
    setLoading(true);
    setCompareMode(false);
    try {
      const scoreData = await fetchScore(jurisdiction.id);
      const jd = scoreResponseToJurisdictionData(scoreData);
      setSelected(jd);
    } catch (err) {
      console.error('Failed to load score:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSelected(null);
    setCompareMode(false);
  }

  // E6-7 / E7-1: Initiate comparison view when a peer chip is clicked
  async function handleCompare(peer: { id: string; name: string; state: string; ris: number }) {
    // Load the peer jurisdiction data if needed, then switch to compare mode
    setCompareMode(true);
    // Pre-fetch peer data so CompareView can load it
    try {
      const peerData = await fetchScore(peer.id);
      const peerJd = scoreResponseToJurisdictionData(peerData);
      if (peerJd && selected) {
        // CompareView is initialized with `selected` and will add peerJd
        setCompareMode(true);
      }
    } catch {
      // Still enter compare mode even if fetch fails — CompareView handles it
      setCompareMode(true);
    }
  }

  // Comparison view — full-width, no map
  if (compareMode && selected) {
    return (
      <CompareView
        initial={selected}
        onBack={() => setCompareMode(false)}
      />
    );
  }

  return (
    <div className={styles.layout}>
      <main className={`${styles.main} ${selected ? styles.mainWithPanel : ''}`}>
        {/* Full-bleed choropleth map as background */}
        <ChoroplethMap selected={selected} onReset={handleReset} />

        {/* Hero content — hidden once a jurisdiction is selected so the map takes focus */}
        {!selected && !loading && (
          <div className={styles.hero}>
            <h1 className={styles.heading}>Parcela</h1>
            <p className={styles.subheading}>
              Understand the regulatory barriers to housing in your jurisdiction.
            </p>
            <JurisdictionSearch onSelect={handleSelect} />
          </div>
        )}
        {loading && <p className={styles.loading}>Loading score…</p>}
      </main>

      {selected && (
        <ScorePanel jurisdiction={selected} onCompare={handleCompare} />
      )}
    </div>
  );
}
