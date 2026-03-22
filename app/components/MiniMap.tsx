'use client'

import { useEffect, useRef } from 'react'
import { risFillColor } from '../../lib/ris'
import { NAME_TO_FIPS } from '../../lib/fips'
import styles from './MiniMap.module.css'

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

    // _leaflet_id is a private Leaflet internal attached to initialized containers.
    // Checking it is a known workaround for HMR double-initialization in dev mode.
    if ((containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id) return
    if (mapRef.current) return

    const controller = new AbortController()

    import('leaflet').then((L) => {
      if (!containerRef.current || controller.signal.aborted) return
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
        attributionControl: true,
      })

      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        opacity: 0.5,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      const fips = NAME_TO_FIPS[jurisdictionName]
      if (!fips) return

      fetch('/geo/target-counties.json', { signal: controller.signal })
        .then((res) => res.json())
        .then((geojson) => {
          if (controller.signal.aborted) return

          const feature = geojson.features.find(
            (f: { id: string }) => f.id === fips,
          )
          if (!feature) return

          const color = risFillColor(ris)
          const layer = L.geoJSON(feature, {
            style: {
              fillColor: color,
              fillOpacity: 0.35,
              color,
              weight: 2,
            },
          })
          layer.addTo(map)

          const bounds = layer.getBounds()
          map.fitBounds(bounds, { padding: [25, 25], maxZoom: 12, animate: false })
          const baseZoom = map.getZoom()
          map.setZoom(Math.min(baseZoom + 0.25, 12), { animate: false })
        })
        .catch(() => {/* aborted or non-fatal fetch error */})
    })

    return () => {
      controller.abort()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      // Clear Leaflet's internal marker so the container can be re-initialized after HMR
      if (containerRef.current) {
        delete (containerRef.current as HTMLElement & { _leaflet_id?: number })._leaflet_id
      }
    }
  // Parent passes key={jurisdictionName} to force re-mount when jurisdiction changes,
  // so empty deps is intentional here — the component lifecycle handles updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={styles.miniMap} />
}
