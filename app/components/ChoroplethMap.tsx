'use client';

import { useEffect, useRef } from 'react';
import type { JurisdictionData } from '../../lib/mockData';
import styles from './ChoroplethMap.module.css';

// BuPu 5-stop palette: light → dark = low → high RIS
const BUPU_STOPS = [
  { min: 0,  max: 20,  color: '#f1eef6' },
  { min: 20, max: 40,  color: '#bdc9e1' },
  { min: 40, max: 60,  color: '#74a9cf' },
  { min: 60, max: 80,  color: '#2b8cbe' },
  { min: 80, max: 100, color: '#045a8d' },
];

const LEGEND_STOPS = [
  { label: '0 Low',  color: '#f1eef6' },
  { label: '20',     color: '#bdc9e1' },
  { label: '40',     color: '#74a9cf' },
  { label: '60',     color: '#2b8cbe' },
  { label: '80 High',color: '#045a8d' },
];

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

// Lookup map from jurisdiction display name to 5-digit FIPS code.
// selected.name from the DB keyed by display name, not FIPS.
const NAME_TO_FIPS: Record<string, string> = {
  'Fairfax County':         '51059',
  'Arlington County':       '51013',
  'Loudoun County':         '51107',
  'Frederick County':       '51069',
  'Prince William County':  '51153',
  'Stafford County':        '51179',
  'Alexandria City':        '51510',
  'Howard County':          '24027',
  'Montgomery County':      '24031',
  "Prince George's County": '24033',
};

function risColor(score: number | undefined): string {
  if (score === undefined) return '#e5e7eb';
  for (const stop of BUPU_STOPS) {
    if (score >= stop.min && score < stop.max) return stop.color;
  }
  return '#045a8d'; // 100 edge case
}

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import to avoid SSR issues (CSS is imported globally in globals.css)
    import('leaflet').then((L) => {
      // Fix default marker icon issue in Next.js
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

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Load and render the US states choropleth
      fetch('/geo/us-states.json')
        .then((res) => res.json())
        .then((geojson) => {
          L.geoJSON(geojson, {
            style: (feature) => {
              const name = feature?.properties?.name as string | undefined;
              const score = name ? STATE_RIS[name] : undefined;
              return {
                fillColor: risColor(score),
                fillOpacity: 0.75,
                color: '#ffffff',
                weight: 1,
              };
            },
          }).addTo(map);
        })
        .catch((err) => console.error('Failed to load GeoJSON:', err));

      // Load target county boundaries for later use when a county is selected
      fetch('/geo/target-counties.json')
        .then((res) => res.json())
        .then((geojson) => {
          countiesRef.current = geojson;
        })
        .catch((err) => console.error('Failed to load county GeoJSON:', err));
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle selection changes — zoom to county or reset to national view
  useEffect(() => {
    if (!mapRef.current) return;

    import('leaflet').then((L) => {
      const map = mapRef.current;

      // Remove previous county layer
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
          // Re-enable interaction in county view
          map.dragging.enable();
          map.scrollWheelZoom.enable();
          map.doubleClickZoom.enable();
          map.touchZoom.enable();

          const color = risColor(selected.ris);
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

          // Fit map to the actual county boundary bounding box
          const bounds = L.geoJSON(feature).getBounds();
          map.fitBounds(bounds, { padding: [40, 40], animate: true, duration: 0.8 });
        }
      } else {
        // Reset to national view — disable interaction
        map.dragging.disable();
        map.scrollWheelZoom.disable();
        map.doubleClickZoom.disable();
        map.touchZoom.disable();
        map.setView([38, -97], 4, { animate: true, duration: 0.8 });
      }
    });
  }, [selected]);

  return (
    <div className={styles.mapWrapper}>
      <div ref={containerRef} className={styles.mapContainer} />

      {/* Legend — always visible */}
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

      {/* Zoom-out button — shown when a county is selected */}
      {selected && (
        <button
          className={styles.resetButton}
          onClick={onReset}
          aria-label="Zoom out to national view"
        >
          Zoom Out
        </button>
      )}
    </div>
  );
}
