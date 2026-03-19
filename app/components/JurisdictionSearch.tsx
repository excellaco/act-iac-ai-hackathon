'use client';

import { useState, useRef, useEffect } from 'react';
import { fetchJurisdictions, type JurisdictionSummary } from '../../lib/apiClient';
import styles from './JurisdictionSearch.module.css';

interface Props {
  onSelect: (jurisdiction: JurisdictionSummary) => void;
  disabled?: boolean;
}

export default function JurisdictionSearch({ onSelect, disabled = false }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionSummary[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = 'jurisdiction-search-listbox';

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

  // Only show real jurisdictions in the dropdown — synthetic are for scoring context only
  const visibleMatches = matches.filter(j => j.dataType === 'real');

  function handleSelect(j: JurisdictionSummary) {
    setQuery(j.displayName);
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
        role="combobox"
        aria-controls={listboxId}
        aria-haspopup="listbox"
        onChange={e => {
          setQuery(e.target.value);
          if (!disabled) setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        aria-label="Find your county or municipality"
        aria-autocomplete="list"
        aria-expanded={!disabled && open}
      />
      {!disabled && open && visibleMatches.length > 0 && (
        <ul className={styles.dropdown} role="listbox" id={listboxId}>
          {visibleMatches.map(j => (
            <li
              key={j.id}
              className={styles.option}
              role="option"
              aria-selected="false"
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
