'use client';

import type { ZoneScore } from '../../lib/mockData';
import styles from './ZoneSelector.module.css';

export interface ZoneSelectorProps {
  zones: ZoneScore[];
  selectedZoneCode: string | '__avg__';
  onChange: (zoneCode: string | '__avg__') => void;
  /** Optional label prefix shown before the selector. */
  label?: string;
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  primary:   'Primary MF',
  permitted: 'Permitted',
  limited:   'Limited',
  none:      'No MF',
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  primary:   '#16a34a',
  permitted: '#2563eb',
  limited:   '#d97706',
  none:      '#6b7280',
}

/**
 * Reusable zone selector dropdown (E2-155).
 * Hidden when zones array is empty (synthetic / pre-zone jurisdictions).
 *
 * Options:
 *   - "All zones (averaged)" — value '__avg__'
 *   - One entry per zone, sorted by risComposite descending, with classification badge
 */
export default function ZoneSelector({ zones, selectedZoneCode, onChange, label }: ZoneSelectorProps) {
  if (zones.length === 0) return null;

  const sorted = [...zones].sort((a, b) => b.risComposite - a.risComposite);

  return (
    <div className={styles.wrapper}>
      {label && <span className={styles.label}>{label}</span>}
      <select
        className={styles.select}
        value={selectedZoneCode}
        onChange={(e) => onChange(e.target.value as string | '__avg__')}
        aria-label="Select zoning district"
      >
        <option value="__avg__">All zones (averaged)</option>
        {sorted.map((z) => (
          <option key={z.zoneCode} value={z.zoneCode}>
            {z.zoneCode}
            {z.zoneName ? ` — ${z.zoneName}` : ''}
            {` · ${CLASSIFICATION_LABELS[z.multifamilyClassification] ?? z.multifamilyClassification}`}
            {` · RIS ${z.risComposite}`}
          </option>
        ))}
      </select>
      {selectedZoneCode !== '__avg__' && (() => {
        const zone = zones.find((z) => z.zoneCode === selectedZoneCode);
        if (!zone) return null;
        return (
          <span
            className={styles.badge}
            style={{ color: CLASSIFICATION_COLORS[zone.multifamilyClassification], background: CLASSIFICATION_COLORS[zone.multifamilyClassification] + '18' }}
          >
            {CLASSIFICATION_LABELS[zone.multifamilyClassification]}
          </span>
        );
      })()}
    </div>
  );
}
