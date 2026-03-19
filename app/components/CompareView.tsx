'use client';

import { useState, useEffect } from 'react';
import { fetchScore, fetchJurisdictions } from '../../lib/apiClient';
import { scoreResponseToJurisdictionData } from '../../lib/mockData';
import type { JurisdictionData } from '../../lib/mockData';
import styles from './CompareView.module.css';

function risColor(score: number): string {
  if (score >= 70) return '#dc2626';
  if (score >= 40) return '#d97706';
  return '#16a34a';
}

function risLabel(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Low';
}

interface RankingBarProps {
  jurisdictions: JurisdictionData[];
}

/** E7-3: Summary ranking bar */
function RankingBar({ jurisdictions }: RankingBarProps) {
  const sorted = [...jurisdictions].sort((a, b) => b.ris - a.ris);

  return (
    <div className={styles.rankingBar}>
      {sorted.map((j, i) => (
        <div key={j.id} className={styles.rankItem}>
          <span className={styles.rankPos}>#{i + 1}</span>
          <div className={styles.rankDetails}>
            <span className={styles.rankName}>{j.name}</span>
            <div className={styles.rankMeta}>
              <span className={styles.rankScore} style={{ color: risColor(j.ris) }}>
                {j.ris}
              </span>
              <span
                className={styles.rankLabel}
                style={{
                  color: risColor(j.ris),
                  background: risColor(j.ris) + '15',
                }}
              >
                {risLabel(j.ris)} Restrictiveness
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface CompareCardProps {
  jurisdiction: JurisdictionData;
  onRemove: () => void;
}

function CompareCard({ jurisdiction, onRemove }: CompareCardProps) {
  const { name, state, ris, subScores } = jurisdiction;
  const color = risColor(ris);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.colorDot} style={{ background: color }} />
          <div>
            <h3 className={styles.cardName}>{name}</h3>
            <p className={styles.cardState}>{state}</p>
          </div>
        </div>
        <div className={styles.cardHeaderRight}>
          <div className={styles.cardScore} style={{ borderColor: color, color }}>
            {ris}
          </div>
          <button className={styles.removeBtn} onClick={onRemove} aria-label={`Remove ${name}`}>
            ×
          </button>
        </div>
      </div>

      <div className={styles.subScores}>
        {(Object.entries(subScores) as [string, { score: number }][]).map(([key, detail]) => {
          const labels: Record<string, string> = {
            dci: 'Density (DCI)',
            dcoi: 'Cost (DCOI)',
            pci: 'Permitting (PCI)',
            crp: 'Peer Rank (CRP)',
          };
          return (
            <div key={key} className={styles.subScoreRow}>
              <span className={styles.subScoreLabel}>{labels[key]}</span>
              <div className={styles.subScoreBar}>
                <div
                  className={styles.subScoreBarFill}
                  style={{ width: `${detail.score}%`, background: risColor(detail.score) }}
                />
              </div>
              <span className={styles.subScoreValue} style={{ color: risColor(detail.score) }}>
                {detail.score}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.cardFields}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Max density</span>
          <span className={styles.fieldValue}>{jurisdiction.fields.densityLimitUpa} units/acre</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Height limit</span>
          <span className={styles.fieldValue}>{jurisdiction.fields.heightLimitFt} ft</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Parking min.</span>
          <span className={styles.fieldValue}>{jurisdiction.fields.parkingMinSpacesPerUnit} spaces/unit</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Review type</span>
          <span className={styles.fieldValue} style={{ textTransform: 'capitalize' }}>
            {jurisdiction.fields.discretionaryReviewType.replace(/-/g, ' ')}
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Cost per unit</span>
          <span className={styles.fieldValue}>
            ${(jurisdiction.feasibility.estimatedCostPerUnit / 1000).toFixed(0)}K
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Rent feasibility</span>
          <span
            className={styles.fieldValue}
            style={{
              color: jurisdiction.feasibility.rentFeasibility === 'Feasible' ? '#16a34a' :
                     jurisdiction.feasibility.rentFeasibility === 'Marginal' ? '#d97706' : '#dc2626',
            }}
          >
            {jurisdiction.feasibility.rentFeasibility}
          </span>
        </div>
      </div>
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
        <span className={styles.addCardLabel}>Add a jurisdiction</span>
        <input
          type="text"
          className={styles.addCardInput}
          placeholder="Search jurisdictions…"
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

      {/* E7-3: Ranking bar */}
      {jurisdictions.length > 1 && (
        <RankingBar jurisdictions={jurisdictions} />
      )}

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
