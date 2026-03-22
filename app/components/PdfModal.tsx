'use client';

import { useEffect } from 'react';
import styles from './PdfModal.module.css';

interface Props {
  jurisdictionId: string;
  sourcePage: number | null;
  sourceSection: string | null;
  fieldValueText: string | null;
  onClose: () => void;
}

export default function PdfModal({ jurisdictionId, sourcePage, sourceSection, fieldValueText, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pdfUrl = `/api/jurisdictions/${jurisdictionId}/pdf${sourcePage ? `#page=${sourcePage}` : ''}`;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Source document">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            {sourceSection && <span className={styles.section}>{sourceSection}</span>}
            {fieldValueText && fieldValueText !== 'Not found in document' && (
              <blockquote className={styles.quote}>{fieldValueText}</blockquote>
            )}
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close PDF viewer">
            ✕
          </button>
        </div>
        <iframe
          src={pdfUrl}
          className={styles.iframe}
          title="Source ordinance document"
        />
      </div>
      <div className={styles.backdrop} onClick={onClose} />
    </div>
  );
}
