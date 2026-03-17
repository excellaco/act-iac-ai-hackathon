'use client';

import { useState, useRef, useEffect } from 'react';
import { JURISDICTIONS, type JurisdictionData } from '../../lib/mockData';
import styles from './JurisdictionSearch.module.css';

interface Props {
  onSelect: (jurisdiction: JurisdictionData) => void;
}

export default function JurisdictionSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = query.trim()
    ? JURISDICTIONS.filter(j =>
        `${j.name}, ${j.state}`.toLowerCase().includes(query.toLowerCase())
      )
    : JURISDICTIONS;

  function handleSelect(j: JurisdictionData) {
    setQuery(`${j.name}, ${j.state}`);
    setOpen(false);
    onSelect(j);
  }

  // Close dropdown on outside click
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
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-label="Find your county or municipality"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && matches.length > 0 && (
        <ul className={styles.dropdown} role="listbox">
          {matches.map(j => (
            <li
              key={j.id}
              className={styles.option}
              role="option"
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
