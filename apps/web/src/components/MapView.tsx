import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DayPlan, Stay } from '../types'

type Props = {
  day: DayPlan | null
  stay?: Stay | null
  focusPlaceId?: string | null
}

export function MapView({ day, stay, focusPlaceId }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    map.setView([41.392, 2.158], 13)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markersRef.current.clear()
    const bounds: L.LatLngTuple[] = []

    if (stay?.lat != null) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="pin-stay">숙소</div>`,
        iconSize: [48, 24],
        iconAnchor: [24, 12],
      })
      L.marker([stay.lat, stay.lng], { icon })
        .bindPopup(`<strong>${stay.name}</strong><br/>${stay.address || stay.note || ''}`)
        .addTo(layer)
      bounds.push([stay.lat, stay.lng])
    }

    const route: L.LatLngTuple[] = []
    day?.places.forEach((p) => {
      if (p.lat == null || p.lng == null) return
      const bg = p.locked ? '#0f4c5c' : '#1e6f8a'
      const icon = L.divIcon({
        className: '',
        html: `<div class="pin-num" style="background:${bg}">${p.order}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      const m = L.marker([p.lat, p.lng], { icon })
        .bindPopup(
          `<strong>${p.order}. ${p.name}</strong><br/>${p.time || ''} · ${p.duration || ''}<br/>${p.note || ''}`,
        )
        .addTo(layer)
      markersRef.current.set(p.id || String(p.order), m)
      bounds.push([p.lat, p.lng])
      if (!p.exclude_from_route) route.push([p.lat, p.lng])
    })

    if (route.length >= 2) {
      L.polyline(route, {
        color: '#1e6f8a',
        weight: 4,
        opacity: 0.75,
        dashArray: '6 8',
      }).addTo(layer)
    }

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 })
    }
    setTimeout(() => map.invalidateSize(), 60)
  }, [day, stay])

  useEffect(() => {
    if (!focusPlaceId) return
    const m = markersRef.current.get(focusPlaceId)
    const map = mapRef.current
    if (m && map) {
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 15), { animate: true })
      m.openPopup()
    }
  }, [focusPlaceId])

  return <div className="map-root" ref={containerRef} />
}
