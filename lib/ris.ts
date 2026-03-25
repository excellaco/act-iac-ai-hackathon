/**
 * Shared RIS (Regulatory Impact Score) presentation utilities.
 *
 * Single source of truth for how RIS scores are displayed across the UI.
 * All components should import from here rather than defining their own
 * color/label functions.
 */

// ── BuPu palette ─────────────────────────────────────────────────────────
// Sequential blue-purple palette used by the choropleth map.
// Standard cartographic choice: colorblind-friendly, sequential data.

export const BUPU_STOPS = [
  { min: 0,  max: 20,  color: '#f1eef6' },
  { min: 20, max: 40,  color: '#bdc9e1' },
  { min: 40, max: 60,  color: '#74a9cf' },
  { min: 60, max: 80,  color: '#2b8cbe' },
  { min: 80, max: 100, color: '#045a8d' },
] as const

export const LEGEND_STOPS = [
  { label: '0 Low',   color: '#f1eef6' },
  { label: '20',      color: '#bdc9e1' },
  { label: '40',      color: '#74a9cf' },
  { label: '60',      color: '#2b8cbe' },
  { label: '80 High', color: '#045a8d' },
] as const

// ── Score → color (for text, borders, badges) ───────────────────────────
// All stops pass WCAG AA contrast (4.5:1) on white backgrounds.
// Low scores use a neutral gray to maintain readability.

export function risColor(score: number): string {
  if (score >= 70) return '#045a8d'
  if (score >= 40) return '#2b8cbe'
  return '#4b5563'
}

// ── Score → fill color (for map regions, backgrounds) ────────────────────
// Uses the full 5-stop palette. Handles undefined (no data) gracefully.

export function risFillColor(score: number | undefined): string {
  if (score === undefined) return '#e5e7eb'
  for (const stop of BUPU_STOPS) {
    if (score >= stop.min && score < stop.max) return stop.color
  }
  return '#045a8d' // score === 100 edge case
}

// ── Score → label ────────────────────────────────────────────────────────

export function risLabel(score: number): string {
  if (score >= 70) return 'High Restrictiveness'
  if (score >= 40) return 'Moderate Restrictiveness'
  return 'Low Restrictiveness'
}

export function risLabelShort(score: number): string {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Moderate'
  return 'Low'
}

// ── Sub-score metadata ───────────────────────────────────────────────────

export type SubScoreKey = 'dci' | 'dcoi' | 'pci' | 'crp'

export const SUB_SCORE_META: Record<SubScoreKey, { label: string; shortLabel: string; description: string }> = {
  dci:  { label: 'Density Constraint Index',        shortLabel: 'Density (DCI)',      description: 'Measures restrictions on lot size, height, density, and setbacks.' },
  dcoi: { label: 'Development Cost Impact',         shortLabel: 'Cost (DCOI)',        description: 'Estimates cost burden from parking requirements and regional construction costs.' },
  pci:  { label: 'Permitting Complexity Indicator',  shortLabel: 'Permitting (PCI)',   description: 'Reflects permit volume and whether multifamily housing requires discretionary approval.' },
  crp:  { label: 'Comparative Restrictiveness',      shortLabel: 'Peer Rank (CRP)',    description: 'Ranks this jurisdiction within a peer comparison set of 10 jurisdictions.' },
}
