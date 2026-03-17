'use client';

import { useState } from 'react';
import type { JurisdictionData } from '../lib/mockData';
import JurisdictionSearch from './components/JurisdictionSearch';
import ScorePanel from './components/ScorePanel';
import styles from './page.module.css';

export default function Home() {
  const [selected, setSelected] = useState<JurisdictionData | null>(null);

  return (
    <div className={styles.layout}>
      <main className={`${styles.main} ${selected ? styles.mainWithPanel : ''}`}>
        <div className={styles.hero}>
          <h1 className={styles.heading}>Parcela</h1>
          <p className={styles.subheading}>
            Understand the regulatory barriers to housing in your jurisdiction.
          </p>
          <JurisdictionSearch onSelect={setSelected} />
        </div>
      </main>

      {selected && (
        <ScorePanel jurisdiction={selected} />
      )}
    </div>
  );
}
