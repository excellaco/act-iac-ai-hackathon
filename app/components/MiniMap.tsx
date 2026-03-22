'use client'

import { useEffect, useRef } from 'react'
import { risFillColor } from '../../lib/ris'
import styles from './MiniMap.module.css'

// Same lookup as ChoroplethMap — maps jurisdiction name to 5-digit FIPS
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
}

interface MiniMapProps {
  jurisdictionName: string
  ris: number
}

export default function MiniMap({ jurisdictionName, ris }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Guard against HMR re-initialization — Leaflet attaches _leaflet_id to the container
    if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return
    if (mapRef.current) return

    import('leaflet').then((L) => {
      // Double-check after async import
      if (!containerRef.current) return
      if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return

      const map = L.map(containerRef.current!, {
        center: [38.5, -77.5],
        zoom: 9,
        zoomSnap: 0.25,
        dragging: false,
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
        boxZoom: false,
        attributionControl: false,
      })

      mapRef.current = map

      // Light tile layer at low opacity for geographic context
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 0.5,
      }).addTo(map)

      // Load county boundary and fit to it
      const fips = NAME_TO_FIPS[jurisdictionName]
      if (!fips) return

      fetch('/geo/target-counties.json')
        .then((res) => res.json())
        .then((geojson) => {
          const feature = geojson.features.find(
            (f: { id: string }) => f.id === fips,
          )
          if (!feature) return

          const color = risFillColor(ris)
          L.geoJSON(feature, {
            style: {
              fillColor: color,
              fillOpacity: 0.35,
              color,
              weight: 2,
            },
          }).addTo(map)

          const bounds = L.geoJSON(feature).getBounds()
          map.fitBounds(bounds, { padding: [25, 25], maxZoom: 12, animate: false })
          const baseZoom = map.getZoom()
          map.setZoom(Math.min(baseZoom + 0.25, 12), { animate: false })
        })
        .catch(() => {/* non-fatal */})
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={styles.miniMap} />
}
