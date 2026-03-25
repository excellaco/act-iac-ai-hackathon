'use client';

import { useState, useEffect } from 'react';
import { fetchScore, fetchJurisdictions } from '../../lib/apiClient';
import { scoreResponseToJurisdictionData } from '../../lib/mockData';
import type { JurisdictionData, ZoneScore } from '../../lib/mockData';
import { risColor, risLabelShort, SUB_SCORE_META, type SubScoreKey } from '../../lib/ris';
import dynamic from 'next/dynamic';
import ZoneSelector from './ZoneSelector';
import styles from './CompareView.module.css';

const MiniMap = dynamic(() => import('./MiniMap'), { ssr: false });

/** Default to averaged view across all zones. */
function defaultZone(): '__avg__' {
  return '__avg__';
}

interface CompareCardProps {
  jurisdiction: JurisdictionData;
  onRemove: () => void;
}

function CompareCard({ jurisdiction, onRemove }: CompareCardProps) {
  const { name, state, ris, subScores, zoneScores } = jurisdiction;
  const [selectedZone, setSelectedZone] = useState<string | '__avg__'>(defaultZone);

  const activeZone = selectedZone !== '__avg__' ? zoneScores.find((z) => z.zoneCode === selectedZone) : null;
  const activeRis = activeZone?.risComposite ?? ris;
  const activeSubScores = activeZone
    ? { dci: activeZone.dci, dcoi: activeZone.dcoi, pci: activeZone.pci, crp: activeZone.crp }
    : { dci: subScores.dci.score, dcoi: subScores.dcoi.score, pci: subScores.pci.score, crp: subScores.crp.score };
  const activeDensity = activeZone?.fields?.densityLimitUpa ?? jurisdiction.fields.densityLimitUpa;
  const activeHeight = activeZone?.fields?.heightLimitFt ?? jurisdiction.fields.heightLimitFt;
  const activeParking = activeZone?.fields?.parkingMinSpacesPerUnit ?? jurisdiction.fields.parkingMinSpacesPerUnit;
  const activeFeasibility = activeZone?.feasibility ?? jurisdiction.feasibility;

  const color = risColor(activeRis);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div>
            <h3 className={styles.cardName}>{name}, {state}</h3>
            <p className={styles.risLabelText} style={{ color }}>{risLabelShort(activeRis)} Restrictiveness</p>
          </div>
        </div>
        <div className={styles.cardHeaderRight}>
          <div className={styles.cardScore} style={{ borderColor: color, color }}>
            {activeRis}
          </div>
          <button className={styles.removeBtn} onClick={onRemove} aria-label={`Remove ${name}`}>
            ×
          </button>
        </div>
      </div>

      <div className={styles.miniMapWrapper}>
        <MiniMap key={`${name}-${activeRis}`} jurisdictionName={name} ris={activeRis} />
      </div>

      {zoneScores.length > 0 && (
        <div className={styles.cardZoneSelector}>
          <ZoneSelector zones={zoneScores} selectedZoneCode={selectedZone} onChange={setSelectedZone} />
        </div>
      )}

      <h4 className={styles.sectionTitle}>Regulatory Impact Score</h4>

      <div className={styles.subScores}>
        {(Object.entries(activeSubScores) as [string, number][]).map(([key, score]) => {
          return (
            <div key={key} className={styles.subScoreRow}>
              <span className={styles.subScoreLabel}>{SUB_SCORE_META[key as SubScoreKey]?.shortLabel ?? key}</span>
              <div className={styles.subScoreBar}>
                <div
                  className={styles.subScoreBarFill}
                  style={{ width: `${score}%`, background: risColor(score) }}
                />
              </div>
              <span className={styles.subScoreValue} style={{ color: risColor(score) }}>
                {score}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.cardFields}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Max density</span>
          <span className={styles.fieldValue}>{activeDensity} units/acre</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Height limit</span>
          <span className={styles.fieldValue}>{activeHeight} ft</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Parking min.</span>
          <span className={styles.fieldValue}>{activeParking} spaces/unit</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Review type</span>
          <span className={styles.fieldValue} style={{ textTransform: 'capitalize' }}>
            {jurisdiction.fields.discretionaryReviewType.replace(/-/g, ' ')}
          </span>
        </div>
      </div>

      {activeFeasibility && (
        <>
          <h4 className={styles.sectionTitle}>Development Feasibility</h4>
          <div className={styles.cardFields}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Cost per unit</span>
              <span className={styles.fieldValue}>
                ${(activeFeasibility.estimatedCostPerUnit / 1000).toFixed(0)}K
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Rent feasibility</span>
              <span
                className={styles.fieldValue}
                style={{
                  color: activeFeasibility.rentFeasibility === 'Feasible' ? '#16a34a' :
                         activeFeasibility.rentFeasibility === 'Marginal' ? '#d97706' : '#dc2626',
                }}
              >
                {activeFeasibility.rentFeasibility}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface AddCardProps {
  onAdd: (jd: JurisdictionData) => void;
  excludeIds: string[];
}

function AddCard({ onAdd, excludeIds }: AddCardProps) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Array<{ id: string; name: string; state: string; risComposite: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchJurisdictions()
      .then((all) =>
        setOptions(
          all.filter(
            (j) => !excludeIds.includes(j.id) && j.dataType === 'real' && j.risComposite != null,
          ),
        )
      )
      .catch(() => {/* ignore */})
  }, [excludeIds]);

  const filtered = search
    ? options.filter((o) =>
        `${o.name} ${o.state}`.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  async function handleSelect(id: string) {
    setLoading(true);
    try {
      const data = await fetchScore(id);
      const jd = scoreResponseToJurisdictionData(data);
      if (jd) onAdd(jd);
    } finally {
      setLoading(false);
      setSearch('');
    }
  }

  return (
    <div className={styles.addCard}>
      <div className={styles.addCardInner}>
        <span className={styles.addCardIcon}>+</span>
        <input
          type="text"
          className={styles.addCardInput}
          placeholder="Add a jurisdiction"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={loading}
        />
        {search && filtered.length > 0 && (
          <div className={styles.addDropdown}>
            {filtered.map((o) => (
              <button
                key={o.id}
                className={styles.addDropdownItem}
                onClick={() => handleSelect(o.id)}
              >
                <span>{o.name}, {o.state}</span>
                <span style={{ color: risColor(Math.round(parseFloat(o.risComposite!))) }}>
                  {Math.round(parseFloat(o.risComposite!))}
                </span>
              </button>
            ))}
          </div>
        )}
        {loading && <p className={styles.addLoading}>Loading…</p>}
      </div>
    </div>
  );
}

interface CompareViewProps {
  initial: JurisdictionData;
  initialPeer?: JurisdictionData;
  onBack: () => void;
}

export default function CompareView({ initial, initialPeer, onBack }: CompareViewProps) {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionData[]>(
    initialPeer ? [initial, initialPeer] : [initial],
  );

  function handleAdd(jd: JurisdictionData) {
    setJurisdictions((prev) => [...prev.filter((j) => j.id !== jd.id), jd]);
  }

  function handleRemove(id: string) {
    setJurisdictions((prev) => {
      const next = prev.filter((j) => j.id !== id);
      return next.length === 0 ? [initial] : next;
    });
  }

  const showAddCard = jurisdictions.length < 3;

  return (
    <div className={styles.view}>
      <div className={styles.topBar}>
        <button className={styles.backButton} onClick={onBack}>
          ← Back to score panel
        </button>
        <h2 className={styles.viewTitle}>Jurisdiction Comparison</h2>
      </div>

      {/* E7-1 / E7-2: Comparison cards grid */}
      <div className={styles.grid}>
        {jurisdictions.map((j) => (
          <CompareCard
            key={j.id}
            jurisdiction={j}
            onRemove={() => handleRemove(j.id)}
          />
        ))}

        {/* E7-2: Add third jurisdiction */}
        {showAddCard && (
          <AddCard onAdd={handleAdd} excludeIds={jurisdictions.map((j) => j.id)} />
        )}
      </div>
    </div>
  );
}
