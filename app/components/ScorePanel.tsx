'use client';

import { useState, useMemo } from 'react';
import type { JurisdictionData, ZoneScore } from '../../lib/mockData';
import { risColor, risLabel, SUB_SCORE_META, type SubScoreKey } from '../../lib/ris';
import ZoneSelector from './ZoneSelector';
import ConfidenceBadge from './ConfidenceBadge';
import MethodologyModal from './MethodologyModal';
import FeasibilityPanel from './FeasibilityPanel';
import WhatIfPanel from './WhatIfPanel';
import ComparePeers from './ComparePeers';
import ChatPanel from './ChatPanel';
import PdfModal from './PdfModal';
import styles from './ScorePanel.module.css';

/** Extracted fields that contribute to each sub-score */
const SUB_SCORE_FIELDS: Record<SubScoreKey, string[]> = {
  dci:  ['min_lot_size_sqft', 'height_limit_ft', 'density_limit_units_per_acre', 'setback_front_ft', 'setback_side_ft', 'setback_rear_ft'],
  dcoi: ['parking_min_spaces_per_unit'],
  pci:  ['discretionary_review_required'],
  crp:  [],
}

const FIELD_LABELS: Record<string, string> = {
  min_lot_size_sqft:             'Min. lot size',
  height_limit_ft:               'Height limit',
  density_limit_units_per_acre:  'Density limit',
  setback_front_ft:              'Front setback',
  setback_side_ft:               'Side setback',
  setback_rear_ft:               'Rear setback',
  parking_min_spaces_per_unit:   'Parking minimum',
  discretionary_review_required: 'Discretionary review',
}

interface Props {
  jurisdiction: JurisdictionData;
  onCompare: (peer: { id: string; name: string; state: string; ris: number }) => void;
}

interface PdfModalState {
  fieldName: string;
  sourcePage: number | null;
  sourceSection: string | null;
  fieldValueText: string | null;
}

/** Find the most permissive zone to use as default (highest-density primary zone). */
function defaultZoneCode(zones: ZoneScore[]): string | '__avg__' {
  const primaryZones = zones.filter((z) => z.multifamilyClassification === 'primary');
  const pool = primaryZones.length > 0 ? primaryZones : zones;
  if (pool.length === 0) return '__avg__';
  return pool.reduce((best, z) => (z.risComposite > best.risComposite ? z : best), pool[0]).zoneCode;
}

export default function ScorePanel({ jurisdiction, onCompare }: Props) {
  const { name, state, ris, subScores, fields, feasibility, citations, zoneScores } = jurisdiction;
  const color = risColor(ris);
  const [showMethodology, setShowMethodology] = useState(false);
  const [whatIfEnabled, setWhatIfEnabled] = useState(false);
  const [pdfModal, setPdfModal] = useState<PdfModalState | null>(null);
  const [selectedZoneCode, setSelectedZoneCode] = useState<string | '__avg__'>(() => defaultZoneCode(zoneScores));

  // Derive active fields/scores/feasibility from selected zone or jurisdiction average
  const activeZone = selectedZoneCode !== '__avg__' ? zoneScores.find((z) => z.zoneCode === selectedZoneCode) : null;

  const activeRis = activeZone?.risComposite ?? ris;
  const activeSubScores = activeZone
    ? {
        dci:  { score: activeZone.dci,  confidence: subScores.dci.confidence,  source: subScores.dci.source  },
        dcoi: { score: activeZone.dcoi, confidence: subScores.dcoi.confidence, source: subScores.dcoi.source },
        pci:  { score: activeZone.pci,  confidence: subScores.pci.confidence,  source: subScores.pci.source  },
        crp:  { score: activeZone.crp,  confidence: subScores.crp.confidence,  source: subScores.crp.source  },
      }
    : subScores;
  const activeFields = activeZone ? { ...fields, ...activeZone.fields } : fields;
  const activeFeasibility = activeZone?.feasibility ?? feasibility;

  const zoneHeadline = selectedZoneCode === '__avg__'
    ? `Regulatory Impact Score (avg. ${zoneScores.length} zones)`
    : `Regulatory Impact Score — ${selectedZoneCode}`;

  const activeColor = risColor(activeRis);

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.jurisdictionName}>{name}, {state}</h2>
          <p className={styles.risLabel} style={{ color: activeColor }}>{risLabel(activeRis)}</p>
        </div>
        <div className={styles.risScore} style={{ borderColor: activeColor, color: activeColor }}>
          {activeRis}
        </div>
      </div>

      {zoneScores.length > 0 && (
        <div className={styles.zoneSelectorWrapper}>
          <ZoneSelector
            zones={zoneScores}
            selectedZoneCode={selectedZoneCode}
            onChange={setSelectedZoneCode}
            label="Zone"
          />
        </div>
      )}

      <p className={styles.risDescription}>
        {zoneHeadline} — composite of density, cost, permitting, and peer comparison sub-scores.{' '}
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

        {/* E8-2 / E8-3 / E8-4 / E8-5 / E8-6: What-If panel */}
        {whatIfEnabled && (
          <WhatIfPanel
            baselineRis={activeRis}
            baselineSubScores={{
              dci:  activeSubScores.dci.score,
              dcoi: activeSubScores.dcoi.score,
              pci:  activeSubScores.pci.score,
              crp:  activeSubScores.crp.score,
            }}
            fields={activeFields}
            baselineFeasibility={activeFeasibility}
            zoneLabel={selectedZoneCode !== '__avg__' ? selectedZoneCode : undefined}
          />
        )}
      </div>

      {/* Sub-score accordions */}
      <div className={styles.accordions}>
        {(Object.entries(activeSubScores) as [keyof typeof activeSubScores, typeof activeSubScores[keyof typeof activeSubScores]][]).map(([key, detail]) => {
          const { label, description } = SUB_SCORE_META[key];
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
                {SUB_SCORE_FIELDS[key].length > 0 && (
                  <ul className={styles.citationList}>
                    {SUB_SCORE_FIELDS[key].map((fieldName) => {
                      const citation = citations?.[fieldName];
                      const hasSource = citation?.sourcePage != null || citation?.sourceSection;
                      return (
                        <li key={fieldName} className={styles.citationItem}>
                          <span className={styles.citationFieldLabel}>{FIELD_LABELS[fieldName] ?? fieldName}</span>
                          {citation?.fieldValueText && citation.fieldValueText !== 'Not found in document' && (
                            <span className={styles.citationQuote}>&ldquo;{citation.fieldValueText}&rdquo;</span>
                          )}
                          {hasSource && (
                            <button
                              className={styles.viewSourceBtn}
                              onClick={() => setPdfModal({
                                fieldName,
                                sourcePage: citation.sourcePage ?? null,
                                sourceSection: citation.sourceSection ?? null,
                                fieldValueText: citation.fieldValueText ?? null,
                              })}
                            >
                              View source
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {/* E4-1 / E4-2 / E4-3 / E4-4: Feasibility panel */}
      <FeasibilityPanel feasibility={activeFeasibility} />

      {/* E6-7: Compare Peers */}
      <ComparePeers current={jurisdiction} onCompare={onCompare} />

      {/* Chat panel — below Compare Peers */}
      <ChatPanel
        jurisdictionId={jurisdiction.id}
        jurisdictionName={`${name}, ${state}`}
      />

      <p className={styles.disclaimer}>
        This score measures regulatory constraint and does not recommend policy positions.
      </p>

      {showMethodology && (
        <MethodologyModal onClose={() => setShowMethodology(false)} />
      )}

      {pdfModal && (
        <PdfModal
          jurisdictionId={jurisdiction.id}
          sourcePage={pdfModal.sourcePage}
          sourceSection={pdfModal.sourceSection}
          fieldValueText={pdfModal.fieldValueText}
          onClose={() => setPdfModal(null)}
        />
      )}
    </aside>
  );
}
