'use client';

import type { ZoneScore } from '../../lib/mockData';
import { risFillColor, risColor } from '../../lib/ris';
import styles from './ZoneOverlay.module.css';

type Classification = ZoneScore['multifamilyClassification'];

const CLASSIFICATION_LABELS: Partial<Record<Classification, string>> = {
  primary:   'Primary MF',
  permitted: 'Permitted',
  limited:   'Limited',
  none:      'No MF',
};

const CLASSIFICATION_COLORS: Partial<Record<Classification, string>> = {
  primary:   '#16a34a',
  permitted: '#2563eb',
  limited:   '#d97706',
  none:      '#6b7280',
};

interface ZoneOverlayProps {
  zones: ZoneScore[];
}

/**
 * Read-only zone legend overlaid on the map in county detail view.
 * Shows each zoning district's RIS score, classification, and color.
 */
export default function ZoneOverlay({ zones }: ZoneOverlayProps) {
  if (zones.length === 0) return null;

  const sorted = [...zones].sort((a, b) => b.risComposite - a.risComposite);

  return (
    <div className={styles.overlay} data-testid="zone-overlay" role="region" aria-label="Zoning districts legend">
      <div className={styles.title}>
        Zoning Districts
        <span className={styles.count}>{zones.length}</span>
      </div>
      <div className={styles.zones}>
        {sorted.map((zone) => {
          const classColor = CLASSIFICATION_COLORS[zone.multifamilyClassification] ?? '#6b7280';
          return (
            <div key={zone.zoneCode} className={styles.zoneRow}>
              <span
                className={styles.dot}
                style={{ background: risFillColor(zone.risComposite) }}
              />
              <div className={styles.zoneInfo}>
                <span className={styles.zoneCode}>{zone.zoneCode}</span>
                {zone.zoneName && (
                  <div className={styles.zoneName}>{zone.zoneName}</div>
                )}
              </div>
              <span
                className={styles.badge}
                style={{ color: classColor, background: classColor + '18' }}
              >
                {CLASSIFICATION_LABELS[zone.multifamilyClassification] ?? zone.multifamilyClassification}
              </span>
              <span className={styles.ris} style={{ color: risColor(zone.risComposite) }}>
                {zone.risComposite}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
