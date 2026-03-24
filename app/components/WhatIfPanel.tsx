'use client';

import { useState, useMemo, useEffect, startTransition } from 'react';
import type { RegulationFields } from '../../lib/mockData';
import type { FeasibilityOutputs } from '../../lib/feasibility';
import { computeAllSubScores } from '../../lib/scoringEngine';
import { computeRIS } from '../../lib/scoring';
import { computeFeasibility } from '../../lib/feasibility';
import styles from './WhatIfPanel.module.css';

/** Only the numeric fields controllable by sliders. */
interface SliderState {
  parkingMinSpacesPerUnit: number;
  heightLimitFt: number;
  densityLimitUpa: number;
  minLotSizeSqft: number;
  setbackFrontFt: number;
}

interface Props {
  /** Stored RIS baseline from DB. */
  baselineRis: number;
  /** Stored sub-scores from DB (used as delta base). */
  baselineSubScores: { dci: number; dcoi: number; pci: number; crp: number };
  /** Regulatory field values (slider starting points). */
  fields: RegulationFields;
  /** Feasibility baseline. */
  baselineFeasibility: FeasibilityOutputs;
  /** When set, shows "Simulating change to [zoneLabel]" in the narrative. */
  zoneLabel?: string;
}

interface SliderConfig {
  key: keyof SliderState;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderConfig[] = [
  { key: 'parkingMinSpacesPerUnit', label: 'Parking minimum',   unit: 'spaces/unit', min: 0,     max: 3.0,   step: 0.25 },
  { key: 'heightLimitFt',           label: 'Height limit',      unit: 'ft',          min: 25,    max: 250,   step: 5 },
  { key: 'densityLimitUpa',         label: 'Density limit',     unit: 'units/acre',  min: 1,     max: 150,   step: 1 },
  { key: 'minLotSizeSqft',          label: 'Min. lot size',     unit: 'sqft',        min: 1000,  max: 87120, step: 1000 },
  { key: 'setbackFrontFt',          label: 'Front setback',     unit: 'ft',          min: 0,     max: 60,    step: 5 },
];

function deltaLabel(delta: number): string {
  if (delta === 0) return '—';
  return delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`;
}

function deltaColor(delta: number, higherIsBad: boolean): string {
  if (delta === 0) return '#6b7280';
  const isBetter = higherIsBad ? delta < 0 : delta > 0;
  return isBetter ? '#16a34a' : '#dc2626';
}

function formatFieldValue(key: keyof SliderState, value: number): string {
  if (key === 'minLotSizeSqft') return `${(value / 43560).toFixed(2)} ac`;
  if (key === 'parkingMinSpacesPerUnit') return value.toFixed(2);
  return String(value);
}

function generateNarrative(
  sliderValues: SliderState,
  baseline: RegulationFields,
  risDelta: number,
  simFeasibility: FeasibilityOutputs,
  baseFeasibility: FeasibilityOutputs,
): string {
  const changes: string[] = [];

  const parking = sliderValues.parkingMinSpacesPerUnit;
  if (parking != null && parking !== baseline.parkingMinSpacesPerUnit) {
    const dir = parking < baseline.parkingMinSpacesPerUnit ? 'Reducing' : 'Increasing';
    changes.push(
      `${dir} parking minimums from ${baseline.parkingMinSpacesPerUnit} to ${parking} spaces/unit`,
    );
  }

  const height = sliderValues.heightLimitFt;
  if (height != null && height !== baseline.heightLimitFt) {
    const dir = height > baseline.heightLimitFt ? 'Raising' : 'Lowering';
    changes.push(`${dir} the height limit from ${baseline.heightLimitFt} ft to ${height} ft`);
  }

  const density = sliderValues.densityLimitUpa;
  if (density != null && density !== baseline.densityLimitUpa) {
    const dir = density > baseline.densityLimitUpa ? 'Increasing' : 'Reducing';
    changes.push(`${dir} the density limit from ${baseline.densityLimitUpa} to ${density} units/acre`);
  }

  const lotSize = sliderValues.minLotSizeSqft;
  if (lotSize != null && lotSize !== baseline.minLotSizeSqft) {
    const dir = lotSize < baseline.minLotSizeSqft ? 'Reducing' : 'Increasing';
    const fromAc = (baseline.minLotSizeSqft / 43560).toFixed(2);
    const toAc   = (lotSize / 43560).toFixed(2);
    changes.push(`${dir} the minimum lot size from ${fromAc} ac to ${toAc} ac`);
  }

  const setback = sliderValues.setbackFrontFt;
  if (setback != null && setback !== baseline.setbackFrontFt) {
    const dir = setback < baseline.setbackFrontFt ? 'Reducing' : 'Increasing';
    changes.push(`${dir} the front setback from ${baseline.setbackFrontFt} ft to ${setback} ft`);
  }

  if (changes.length === 0) {
    return '';
  }

  const changeSummary = changes.join('; ').replace(/;([^;]*)$/, ' and$1') + '.';

  const yieldDelta = simFeasibility.maxUnitsPerAcre - baseFeasibility.maxUnitsPerAcre;
  const costDelta  = simFeasibility.estimatedCostPerUnit - baseFeasibility.estimatedCostPerUnit;
  const risDir     = risDelta < 0 ? `drop by ${Math.abs(risDelta)} points` : `increase by ${risDelta} points`;

  let impact = `This would ${risDir} on the Regulatory Impact Score`;

  if (yieldDelta !== 0) {
    const yieldDir = yieldDelta > 0 ? 'increase' : 'decrease';
    impact += `, ${yieldDir} max unit yield from ${baseFeasibility.maxUnitsPerAcre} to ${simFeasibility.maxUnitsPerAcre} units/acre`;
  }

  if (Math.abs(costDelta) > 1000) {
    const costDir = costDelta < 0 ? 'reduce' : 'raise';
    const fromK = (baseFeasibility.estimatedCostPerUnit / 1000).toFixed(0);
    const toK   = (simFeasibility.estimatedCostPerUnit / 1000).toFixed(0);
    impact += `, and ${costDir} estimated construction cost from $${fromK}K to $${toK}K per unit`;
  }

  impact += `. Market feasibility: ${simFeasibility.rentFeasibility}.`;

  return `${changeSummary} ${impact}`;
}

export default function WhatIfPanel({
  baselineRis,
  baselineSubScores,
  fields,
  baselineFeasibility,
  zoneLabel,
}: Props) {
  // Slider state — initialized to baseline field values
  const [sliderValues, setSliderValues] = useState<SliderState>({
    parkingMinSpacesPerUnit: fields.parkingMinSpacesPerUnit,
    heightLimitFt:           fields.heightLimitFt,
    densityLimitUpa:         fields.densityLimitUpa,
    minLotSizeSqft:          fields.minLotSizeSqft,
    setbackFrontFt:          fields.setbackFrontFt,
  });

  // Reset sliders when the underlying fields change (e.g. zone selection changes)
  useEffect(() => {
    startTransition(() => {
      setSliderValues({
        parkingMinSpacesPerUnit: fields.parkingMinSpacesPerUnit,
        heightLimitFt:           fields.heightLimitFt,
        densityLimitUpa:         fields.densityLimitUpa,
        minLotSizeSqft:          fields.minLotSizeSqft,
        setbackFrontFt:          fields.setbackFrontFt,
      });
    });
  }, [fields]);

  // E8-3 / E8-4: Compute simulated scores and feasibility from slider values
  const { simulatedRis, simulatedFeasibility, risDelta } = useMemo(() => {
    const simFields: RegulationFields = { ...fields, ...sliderValues };

    // Compute delta approach: simulated = stored + delta from formula
    const baseComputed  = computeAllSubScores({ ...fields, slug: undefined });
    const simComputed   = computeAllSubScores({ ...simFields, slug: undefined });

    const deltaDci  = simComputed.dci  - baseComputed.dci;
    const deltaDcoi = simComputed.dcoi - baseComputed.dcoi;
    const deltaPci  = simComputed.pci  - baseComputed.pci;
    const deltaCrp  = simComputed.crp  - baseComputed.crp;

    const simSubScores = {
      dci:  Math.max(0, Math.min(100, baselineSubScores.dci  + deltaDci)),
      dcoi: Math.max(0, Math.min(100, baselineSubScores.dcoi + deltaDcoi)),
      pci:  Math.max(0, Math.min(100, baselineSubScores.pci  + deltaPci)),
      crp:  Math.max(0, Math.min(100, baselineSubScores.crp  + deltaCrp)),
    };

    const simulatedRis = computeRIS(simSubScores);
    const risDelta = simulatedRis - baselineRis;

    const simulatedFeasibility = computeFeasibility({
      densityLimitUpa:         simFields.densityLimitUpa,
      parkingMinSpacesPerUnit: simFields.parkingMinSpacesPerUnit,
      regionalMultiplier:      simFields.regionalMultiplier,
      fmr2br:                  simFields.fmr2br,
    });

    return { simulatedRis, simulatedFeasibility, risDelta };
  }, [sliderValues, fields, baselineSubScores, baselineRis]);

  // E8-6: Plain-language narrative
  const narrative = useMemo(() => {
    const base = generateNarrative(sliderValues, fields, risDelta, simulatedFeasibility, baselineFeasibility);
    if (zoneLabel && base) {
      return `[Simulating ${zoneLabel}] ${base}`;
    }
    return base;
  }, [sliderValues, fields, risDelta, simulatedFeasibility, baselineFeasibility, zoneLabel]);

  // E8-5: Reset sliders to baseline
  function handleReset() {
    setSliderValues({
      parkingMinSpacesPerUnit: fields.parkingMinSpacesPerUnit,
      heightLimitFt:           fields.heightLimitFt,
      densityLimitUpa:         fields.densityLimitUpa,
      minLotSizeSqft:          fields.minLotSizeSqft,
      setbackFrontFt:          fields.setbackFrontFt,
    });
  }

  const hasChanges = SLIDERS.some(
    (s) => sliderValues[s.key] !== (fields[s.key] as number),
  );

  const risDeltaColor = risDelta < 0 ? '#16a34a' : risDelta > 0 ? '#dc2626' : '#6b7280';

  return (
    <div className={styles.panel}>
      {/* E8-3: Score comparison */}
      <div className={styles.scoreBlock}>
        <div className={styles.scoreItem}>
          <span className={styles.scoreItemLabel}>Baseline RIS</span>
          <span className={styles.scoreItemValue}>{baselineRis}</span>
        </div>
        <div className={styles.scoreArrow}>→</div>
        <div className={styles.scoreItem}>
          <span className={styles.scoreItemLabel}>Simulated RIS</span>
          <span className={styles.scoreItemValue} style={{ color: risDeltaColor }}>
            {simulatedRis}
          </span>
        </div>
        <div
          className={styles.scoreDelta}
          style={{ color: risDeltaColor, background: risDeltaColor + '15' }}
        >
          {risDelta === 0 ? 'No change' : risDelta > 0 ? `+${risDelta}` : risDelta}
        </div>
      </div>

      {/* E8-2: Sliders */}
      <div className={styles.sliders}>
        {SLIDERS.map(({ key, label, unit, min, max, step }) => {
          const current  = sliderValues[key];
          const baseline = fields[key] as number;
          const pctDelta = baseline !== 0
            ? Math.round(((current - baseline) / baseline) * 100)
            : 0;
          const changed  = current !== baseline;

          return (
            <div key={key} className={styles.sliderRow}>
              <div className={styles.sliderHeader}>
                <span className={styles.sliderLabel}>{label}</span>
                <div className={styles.sliderValues}>
                  {changed && (
                    <span className={styles.baseline}>
                      <s>{formatFieldValue(key, baseline)} {unit}</s>
                    </span>
                  )}
                  <span className={styles.currentValue}>
                    {formatFieldValue(key, current)} {unit}
                  </span>
                  {changed && (
                    <span
                      className={styles.deltaBadge}
                      style={(() => {
                        const higherIsBad = (['minLotSizeSqft', 'parkingMinSpacesPerUnit', 'setbackFrontFt'] as Array<keyof SliderState>).includes(key);
                        const c = deltaColor(pctDelta, higherIsBad);
                        return { color: c, background: c + '20' };
                      })()}
                    >
                      {deltaLabel(pctDelta)}%
                    </span>
                  )}
                </div>
              </div>
              <input
                type="range"
                className={styles.slider}
                min={min}
                max={max}
                step={step}
                value={current}
                onChange={(e) =>
                  setSliderValues((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }) as SliderState)
                }
                aria-label={`${label} slider`}
              />
            </div>
          );
        })}
      </div>

      {/* E8-4: Feasibility outputs */}
      <div className={styles.feasGrid}>
        <div className={styles.feasCard}>
          <span className={styles.feasValue}>{simulatedFeasibility.maxUnitsPerAcre}</span>
          <span className={styles.feasLabel}>Max units/acre</span>
          {simulatedFeasibility.maxUnitsPerAcre !== baselineFeasibility.maxUnitsPerAcre && (
            <span className={styles.feasDelta}
              style={{ color: deltaColor(simulatedFeasibility.maxUnitsPerAcre - baselineFeasibility.maxUnitsPerAcre, false) }}>
              {deltaLabel(Math.round(simulatedFeasibility.maxUnitsPerAcre - baselineFeasibility.maxUnitsPerAcre))}
            </span>
          )}
        </div>
        <div className={styles.feasCard}>
          <span className={styles.feasValue}>{simulatedFeasibility.parkingFootprintPct}%</span>
          <span className={styles.feasLabel}>Parking footprint</span>
          {simulatedFeasibility.parkingFootprintPct !== baselineFeasibility.parkingFootprintPct && (
            <span className={styles.feasDelta}
              style={{ color: deltaColor(simulatedFeasibility.parkingFootprintPct - baselineFeasibility.parkingFootprintPct, true) }}>
              {deltaLabel(Math.round(simulatedFeasibility.parkingFootprintPct - baselineFeasibility.parkingFootprintPct))}%
            </span>
          )}
        </div>
        <div className={styles.feasCard}>
          <span className={styles.feasValue}>${(simulatedFeasibility.estimatedCostPerUnit / 1000).toFixed(0)}K</span>
          <span className={styles.feasLabel}>Cost per unit</span>
          {simulatedFeasibility.estimatedCostPerUnit !== baselineFeasibility.estimatedCostPerUnit && (
            <span className={styles.feasDelta}
              style={{ color: deltaColor(simulatedFeasibility.estimatedCostPerUnit - baselineFeasibility.estimatedCostPerUnit, true) }}>
              {deltaLabel(Math.round((simulatedFeasibility.estimatedCostPerUnit - baselineFeasibility.estimatedCostPerUnit) / 1000))}K
            </span>
          )}
        </div>
        <div className={styles.feasCard} style={{
          color: simulatedFeasibility.rentFeasibility === 'Feasible' ? '#16a34a' :
                 simulatedFeasibility.rentFeasibility === 'Marginal' ? '#d97706' : '#dc2626'
        }}>
          <span className={styles.feasValue}>{simulatedFeasibility.rentFeasibility}</span>
          <span className={styles.feasLabel}>Rent feasibility</span>
        </div>
      </div>

      {/* E8-6: Plain-language narrative — hidden until sliders are moved */}
      {narrative && (
        <div className={styles.narrative}>
          <p className={styles.narrativeText}>{narrative}</p>
        </div>
      )}

      {/* E8-5: Reset button */}
      {hasChanges && (
        <button className={styles.resetButton} onClick={handleReset}>
          Reset to baseline values
        </button>
      )}
    </div>
  );
}
