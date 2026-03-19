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

function formatJurisdictionLabel(jurisdiction: { name: string; state: string }) {
  return `${jurisdiction.name}, ${jurisdiction.state}`;
}

export default function Home() {
  const [selected, setSelected] = useState<JurisdictionData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePeer, setComparePeer] = useState<JurisdictionData | null>(null);

  async function handleSelect(jurisdiction: JurisdictionSummary) {
    const previousSelectionLabel = selected ? formatJurisdictionLabel(selected) : '';
    setLoading(true);
    setLoadError(null);
    setCompareMode(false);
    setComparePeer(null);
    try {
      const scoreData = await fetchScore(jurisdiction.id);
      const jd = scoreResponseToJurisdictionData(scoreData);
      if (!jd) {
        throw new Error('Score data unavailable');
      }
      setSelected(jd);
      setSearchQuery(formatJurisdictionLabel(jd));
    } catch (err) {
      console.error('Failed to load score:', err);
      setSearchQuery(previousSelectionLabel);
      setLoadError('Failed to load jurisdiction score. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(query: string) {
    setSearchQuery(query);
    if (loadError) {
      setLoadError(null);
    }
  }

  function handleReset() {
    setSelected(null);
    setSearchQuery('');
    setLoadError(null);
    setCompareMode(false);
    setComparePeer(null);
  }

  // E6-7 / E7-1: Initiate comparison view when a peer chip is clicked
  async function handleCompare(peer: { id: string; name: string; state: string; ris: number }) {
    try {
      const peerData = await fetchScore(peer.id);
      const peerJd = scoreResponseToJurisdictionData(peerData);
      setComparePeer(peerJd);
    } catch {
      setComparePeer(null);
    }
    setCompareMode(true);
  }

  // Comparison view — full-width, no map
  if (compareMode && selected) {
    return (
      <CompareView
        initial={selected}
        initialPeer={comparePeer ?? undefined}
        onBack={() => { setCompareMode(false); setComparePeer(null); }}
      />
    );
  }

  return (
    <div className={styles.layout}>
      <main className={`${styles.main} ${selected ? styles.mainWithPanel : ''}`}>
        {/* Full-bleed choropleth map as background */}
        <ChoroplethMap selected={selected} onReset={handleReset} />

        <div className={selected ? styles.searchShellCompact : styles.searchShellHero}>
          {!selected && !loading && (
            <div className={styles.heroCopy}>
              <h1 className={styles.heading}>Parcela</h1>
              <p className={`${styles.subheading} ${styles.heroSubheading}`}>
                Understand the regulatory barriers to housing in your jurisdiction.
              </p>
            </div>
          )}

          <div key="search" className={styles.searchSlot}>
            <JurisdictionSearch
              query={searchQuery}
              onQueryChange={handleQueryChange}
              onSelect={handleSelect}
              disabled={loading}
            />
          </div>
        </div>

        {loadError && <p className={styles.error} role="alert">{loadError}</p>}
        {loading && <p className={styles.loading}>Loading score…</p>}
      </main>

      {selected && (
        <ScorePanel jurisdiction={selected} onCompare={handleCompare} />
      )}
    </div>
  );
}
