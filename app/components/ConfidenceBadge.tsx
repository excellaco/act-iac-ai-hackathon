import type { ConfidenceTier } from '../../lib/mockData';
import styles from './ConfidenceBadge.module.css';

const TOOLTIPS: Record<ConfidenceTier, string> = {
  High: 'Value extracted directly from zoning text with clear, unambiguous language.',
  Medium: 'Value extracted from zoning text but required interpretation or inference.',
  Low: 'Value could not be reliably extracted; estimate or default used.',
};

export default function ConfidenceBadge({ tier }: { tier: ConfidenceTier }) {
  return (
    <span className={`${styles.badge} ${styles[tier.toLowerCase()]}`} title={TOOLTIPS[tier]}>
      {tier}
    </span>
  );
}
