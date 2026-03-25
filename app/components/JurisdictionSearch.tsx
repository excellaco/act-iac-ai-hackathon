'use client';

import { useState, useRef, useEffect } from 'react';
import { fetchJurisdictions, type JurisdictionSummary } from '../../lib/apiClient';
import styles from './JurisdictionSearch.module.css';

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (jurisdiction: JurisdictionSummary) => void;
  disabled?: boolean;
}

export default function JurisdictionSearch({
  query,
  onQueryChange,
  onSelect,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionSummary[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchJurisdictions()
      .then(setJurisdictions)
      .catch(console.error)
  }, [])

  const matches = query.trim()
    ? jurisdictions.filter(j =>
        j.displayName.toLowerCase().includes(query.toLowerCase())
      )
    : jurisdictions;

  const visibleMatches = matches;

  function handleSelect(j: JurisdictionSummary) {
    setOpen(false);
    onSelect(j);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        className={styles.input}
        type="text"
        placeholder="Find your county or municipality"
        value={query}
        disabled={disabled}
        onChange={e => {
          onQueryChange(e.target.value);
          if (!disabled) setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        aria-label="Find your county or municipality"
      />
      {!disabled && open && visibleMatches.length > 0 && (
        <ul className={styles.dropdown}>
          {visibleMatches.map(j => (
            <li
              key={j.id}
              className={styles.option}
              onMouseDown={() => handleSelect(j)}
            >
              <span className={styles.optionName}>{j.name}</span>
              <span className={styles.optionState}>{j.state}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
