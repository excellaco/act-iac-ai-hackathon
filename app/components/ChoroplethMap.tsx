'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { JurisdictionData } from '../../lib/mockData';
import { risFillColor, LEGEND_STOPS } from '../../lib/ris';
import { NAME_TO_FIPS } from '../../lib/fips';
import styles from './ChoroplethMap.module.css';

const STATE_RIS: Record<string, number> = {
  'Virginia': 68, 'Maryland': 62, 'California': 75, 'Texas': 45,
  'New York': 72, 'Florida': 55, 'Washington': 60, 'Oregon': 58,
  'Colorado': 50, 'Illinois': 65, 'Massachusetts': 78, 'New Jersey': 70,
  'Pennsylvania': 52, 'Ohio': 48, 'Georgia': 44, 'North Carolina': 47,
  'Arizona': 42, 'Nevada': 40, 'Minnesota': 54, 'Wisconsin': 49,
  'Michigan': 51, 'Indiana': 43, 'Missouri': 46, 'Tennessee': 41,
  'Alabama': 38, 'South Carolina': 40, 'Connecticut': 74, 'Rhode Island': 76,
  'New Hampshire': 66, 'Vermont': 64, 'Maine': 55, 'Delaware': 58,
  'Hawaii': 72, 'Alaska': 30, 'Idaho': 35, 'Montana': 32, 'Wyoming': 28,
  'North Dakota': 25, 'South Dakota': 27, 'Nebraska': 30, 'Kansas': 33,
  'Oklahoma': 36, 'Arkansas': 34, 'Louisiana': 42, 'Mississippi': 35,
  'Kentucky': 39, 'West Virginia': 38, 'Iowa': 31, 'New Mexico': 37,
  'Utah': 44, 'District of Columbia': 80,
};

// Reverse lookup: FIPS → jurisdiction name (for click-to-select in regional view)
const FIPS_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_FIPS).map(([name, fips]) => [fips, name]),
);

// Bounding box for all target jurisdictions (VA/MD/DC area)
const REGIONAL_BOUNDS: [[number, number], [number, number]] = [[38.24, -78.55], [39.47, -76.67]];

interface ChoroplethMapProps {
  selected: JurisdictionData | null;
  onReset?: () => void;
  onSelectByName?: (name: string, state: string) => void;
}

export default function ChoroplethMap({ selected, onReset, onSelectByName }: ChoroplethMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countyLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countiesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statesLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regionalLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  const [zoomedOut, setZoomedOut] = useState(false);

  // ── Layer management helpers ──────────────────────────────────────────────

  function fadeStatesLayer() {
    if (statesLayerRef.current) {
      statesLayerRef.current.setStyle({ fillOpacity: 0.30, weight: 0.5 });
    }
  }

  function restoreStatesLayer() {
    if (statesLayerRef.current) {
      statesLayerRef.current.setStyle({ fillOpacity: 0.75, weight: 1 });
    }
  }

  function removeRegionalLayer() {
    if (regionalLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(regionalLayerRef.current);
      regionalLayerRef.current = null;
    }
  }

  // ── Regional view: fade states, show all target counties ──────────────────

  const handleRegionalView = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    fadeStatesLayer();

    if (countiesRef.current && !regionalLayerRef.current) {
      const layer = L.geoJSON(countiesRef.current, {
        style: (feature: { id?: string }) => {
          const fips = feature?.id as string | undefined;
          const isSelected = selected && NAME_TO_FIPS[selected.name] === fips;
          return {
            fillColor: isSelected ? risFillColor(selected!.ris) : '#4f46e5',
            fillOpacity: isSelected ? 0.55 : 0.3,
            color: isSelected ? '#1e40af' : '#4f46e5',
            weight: isSelected ? 3 : 2,
          };
        },
      });

      layer.bindTooltip((l: { feature?: { properties?: { NAME?: string; LSAD?: string } } }) => {
        const props = l.feature?.properties;
        return `${props?.NAME ?? ''} ${props?.LSAD ?? ''}`.trim();
      });

      layer.on('click', (e: { layer?: { feature?: { id?: string } } }) => {
        const fips = e.layer?.feature?.id as string | undefined;
        if (fips && onSelectByName) {
          const countyName = FIPS_TO_NAME[fips];
          const stateCode = fips.startsWith('24') ? 'MD' : 'VA';
          if (countyName) onSelectByName(countyName, stateCode);
        }
      });

      layer.addTo(map);
      regionalLayerRef.current = layer;
    }

    map.fitBounds(REGIONAL_BOUNDS, { padding: [30, 30], animate: true, duration: 0.8 });
    setZoomedOut(true);
  }, [selected, onSelectByName]);

  // ── Zoom back to selected county ──────────────────────────────────────────

  const handleZoomToCounty = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    removeRegionalLayer();
    restoreStatesLayer();

    if (countyLayerRef.current) {
      const bounds = countyLayerRef.current.getBounds();
      map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.8 });
    }
    setZoomedOut(false);
  }, []);

  // ── Map initialization ────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // _leaflet_id is a private Leaflet internal attached to initialized containers.
    // Checking it is a known workaround for HMR double-initialization in dev mode.
    if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return;

    import('leaflet').then((L) => {
      if (!containerRef.current) return;
      if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return;

      leafletRef.current = L;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, {
        center: [38, -97],
        zoom: 4,
        dragging: false,
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
        boxZoom: false,
        attributionControl: true,
      });

      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      fetch('/geo/us-states.json')
        .then((res) => res.json())
        .then((geojson) => {
          const statesLayer = L.geoJSON(geojson, {
            style: (feature) => {
              const name = feature?.properties?.name as string | undefined;
              const score = name ? STATE_RIS[name] : undefined;
              return {
                fillColor: risFillColor(score),
                fillOpacity: 0.75,
                color: '#ffffff',
                weight: 1,
              };
            },
          }).addTo(map);
          statesLayerRef.current = statesLayer;
        })
        .catch((err) => console.error('Failed to load GeoJSON:', err));

      fetch('/geo/target-counties.json')
        .then((res) => res.json())
        .then((geojson) => { countiesRef.current = geojson; })
        .catch((err) => console.error('Failed to load county GeoJSON:', err));
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (containerRef.current) {
        delete (containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Clean up regional layer when jurisdiction changes ─────────────────────

  useEffect(() => {
    removeRegionalLayer();
    restoreStatesLayer();
    setZoomedOut(false);
  }, [selected]);

  // ── Handle selection changes — zoom to county or reset to national ────────

  useEffect(() => {
    if (!mapRef.current) return;

    const L = leafletRef.current;
    if (!L) {
      // Leaflet not loaded yet — retry after import
      import('leaflet').then((mod) => {
        leafletRef.current = mod;
        // Re-trigger by calling the same logic below
      });
      return;
    }

    const map = mapRef.current;

    if (countyLayerRef.current) {
      map.removeLayer(countyLayerRef.current);
      countyLayerRef.current = null;
    }

    if (selected) {
      const fips = NAME_TO_FIPS[selected.name];
      const counties = countiesRef.current;
      const feature = fips && counties
        ? counties.features.find((f: { id: string }) => f.id === fips)
        : null;

      if (feature) {
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.doubleClickZoom.enable();
        map.touchZoom.enable();

        const color = risFillColor(selected.ris);
        const layer = L.geoJSON(feature, {
          style: {
            fillColor: color,
            fillOpacity: 0.65,
            color: '#1e40af',
            weight: 2,
          },
        });

        layer.bindPopup(
          `<div style="text-align:center;font-family:sans-serif">
            <strong style="font-size:14px">${selected.name}, ${selected.state}</strong><br/>
            <span style="font-size:20px;font-weight:800;color:${color}">${selected.ris}</span><br/>
            <span style="font-size:11px;color:#6b7280">Regulatory Impact Score</span>
          </div>`,
          { minWidth: 160 }
        );

        layer.addTo(map);
        layer.openPopup();
        countyLayerRef.current = layer;

        const bounds = L.geoJSON(feature).getBounds();
        map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.8 });
      }
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.setView([38, -97], 4, { animate: true, duration: 0.8 });
    }
  }, [selected]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.mapWrapper}>
      <div ref={containerRef} className={styles.mapContainer} />

      <div className={styles.legend}>
        <div className={styles.legendTitle}>Regulatory Impact Score</div>
        <div className={styles.legendItems}>
          {LEGEND_STOPS.map((stop) => (
            <div key={stop.label} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: stop.color }} />
              <span className={styles.legendLabel}>{stop.label}</span>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div className={styles.mapControls}>
          {!zoomedOut ? (
            <button className={styles.mapButton} onClick={handleRegionalView} aria-label="Zoom out to regional view">
              Regional View
            </button>
          ) : (
            <>
              <button className={styles.mapButton} onClick={handleZoomToCounty} aria-label="Zoom in to selected county">
                Zoom to County
              </button>
              <button className={styles.mapButton} onClick={onReset} aria-label="Clear selection and return to home">
                Clear Selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
