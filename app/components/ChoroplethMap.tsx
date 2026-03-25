'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { JurisdictionData } from '../../lib/mockData';
import { risFillColor, LEGEND_STOPS } from '../../lib/ris';
import { NAME_TO_FIPS } from '../../lib/fips';
import ZoneOverlay from './ZoneOverlay';
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

interface ChoroplethMapProps {
  selected: JurisdictionData | null;
  onReset?: () => void;
}

export default function ChoroplethMap({ selected, onReset }: ChoroplethMapProps) {
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
  const leafletRef = useRef<any>(null);
  // Tracks when the map and county GeoJSON are both ready so the selection
  // effect re-runs after async initialization completes.
  const [mapReady, setMapReady] = useState(false);

  // ── Re-center: fit map to selected county bounds ─────────────────────────

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !countyLayerRef.current) return;

    const bounds = countyLayerRef.current.getBounds();
    map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.8 });
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
        .then((geojson) => {
          countiesRef.current = geojson;
          // Signal that the map and county data are ready so the selection
          // effect can zoom to the selected jurisdiction.
          setMapReady(true);
        })
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

  // ── Handle selection changes — zoom to county or reset to national ────────
  // `mapReady` is included so this effect re-runs after async initialization
  // (e.g. returning from CompareView remounts the map and re-loads GeoJSON).

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const L = leafletRef.current;
    const map = mapRef.current;

    if (countyLayerRef.current) {
      map.removeLayer(countyLayerRef.current);
      countyLayerRef.current = null;
    }

    if (selected) {
      // Hide state choropleth so only the selected county is visible
      if (statesLayerRef.current) {
        statesLayerRef.current.setStyle({ fillOpacity: 0, weight: 0 });
      }

      const fips = NAME_TO_FIPS[selected.name];
      const counties = countiesRef.current;
      const feature = fips && counties
        ? counties.features.find((f: { id: string }) => f.id === fips)
        : null;

      if (feature) {
        // Enable dragging only — scroll zoom disabled to prevent accidental zoom-out
        map.dragging.enable();

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
        // Extra right padding accounts for the 380px score panel covering the map
        map.fitBounds(bounds, { paddingTopLeft: [40, 40], paddingBottomRight: [400, 40], animate: true, duration: 0.8 });
      }
    } else {
      // Restore state choropleth to full opacity
      if (statesLayerRef.current) {
        statesLayerRef.current.setStyle({ fillOpacity: 0.75, weight: 1 });
      }
      map.dragging.disable();
      map.setView([38, -97], 4, { animate: true, duration: 0.8 });
    }
  }, [selected, mapReady]);

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

      {selected && selected.zoneScores.length > 0 && (
        <ZoneOverlay zones={selected.zoneScores} />
      )}

      {selected && (
        <div className={styles.mapControls}>
          <button className={styles.mapButton} onClick={handleRecenter} aria-label="Re-center map on selected county">
            Re-center
          </button>
        </div>
      )}
    </div>
  );
}
