'use client';

import { useState, useEffect } from 'react';
import { fetchJurisdictions } from '../../lib/apiClient';
import type { JurisdictionData } from '../../lib/mockData';
import styles from './ComparePeers.module.css';

function risColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 40) return '#d97706';
  return '#16a34a';
}

interface Props {
  current: JurisdictionData;
  onCompare: (peer: { id: string; name: string; state: string; ris: number }) => void;
}

export default function ComparePeers({ current, onCompare }: Props) {
  const [peers, setPeers] = useState<Array<{ id: string; name: string; state: string; risComposite: string | null }>>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchJurisdictions()
      .then((all) =>
        setPeers(
          all
            .filter((j) => j.id !== current.id && j.dataType === 'real' && j.risComposite != null)
            .sort((a, b) => parseFloat(a.risComposite!) - parseFloat(b.risComposite!))
        )
      )
      .catch(() => {/* ignore */})
  }, [current.id]);

  const filtered = search
    ? peers.filter((p) =>
        `${p.name} ${p.state}`.toLowerCase().includes(search.toLowerCase())
      )
    : peers.slice(0, 3);  // show top 3 by default

  return (
    <div className={styles.section}>
      <h3 className={styles.title}>Compare Peers</h3>

      <div className={styles.chips}>
        {peers.slice(0, 3).map((peer) => {
          const peerRis = Math.round(parseFloat(peer.risComposite!));
          const delta = peerRis - current.ris;
          const color = risColor(peerRis);
          return (
            <button
              key={peer.id}
              className={styles.chip}
              onClick={() => onCompare({ id: peer.id, name: peer.name, state: peer.state, ris: peerRis })}
              title={`Compare with ${peer.name}, ${peer.state}`}
            >
              <span className={styles.chipName}>{peer.name}</span>
              <span className={styles.chipRight}>
                <span className={styles.chipScore} style={{ color }}>{peerRis}</span>
                <span
                  className={styles.chipDelta}
                  style={{ color: delta < 0 ? '#16a34a' : '#dc2626' }}
                >
                  {delta > 0 ? `+${delta}` : delta} pts
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.divider}>
        <span className={styles.dividerText}>or search</span>
      </div>

      <div className={styles.searchRow}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Add a jurisdiction to compare…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {search && filtered.length > 0 && (
        <div className={styles.dropdown}>
          {filtered.map((peer) => {
            const peerRis = Math.round(parseFloat(peer.risComposite!));
            return (
              <button
                key={peer.id}
                className={styles.dropdownItem}
                onClick={() => {
                  onCompare({ id: peer.id, name: peer.name, state: peer.state, ris: peerRis });
                  setSearch('');
                }}
              >
                <span>{peer.name}, {peer.state}</span>
                <span className={styles.dropdownScore} style={{ color: risColor(peerRis) }}>
                  {peerRis}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {search && filtered.length === 0 && (
        <p className={styles.noResults}>No matching jurisdictions found.</p>
      )}
    </div>
  );
}
