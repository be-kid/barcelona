import type { Itinerary, Place } from '../types'

export function mapsPlaceUrl(place: Pick<Place, 'name' | 'name_en' | 'lat' | 'lng'>): string {
  if (place.lat != null && place.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
  }
  const name = place.name_en || place.name || 'Barcelona'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} Barcelona`)}`
}

export function mapsDayUrl(itinerary: Itinerary, dayId: string): string {
  const day = itinerary.days_plan.find((d) => d.id === dayId)
  if (!day) return 'https://www.google.com/maps'
  const route = day.places.filter(
    (p) => p.lat != null && p.lng != null && !p.exclude_from_route,
  )
  if (route.length < 2) {
    return route[0] ? mapsPlaceUrl(route[0]) : 'https://www.google.com/maps'
  }
  const origin = `${route[0].lat},${route[0].lng}`
  const destination = `${route[route.length - 1].lat},${route[route.length - 1].lng}`
  const waypoints = route
    .slice(1, -1)
    .map((p) => `${p.lat},${p.lng}`)
    .join('|')
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: day.travelmode || 'walking',
  })
  if (waypoints) params.set('waypoints', waypoints)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function enrichItinerary(data: Itinerary): Itinerary {
  return {
    ...data,
    stay: data.stay
      ? { ...data.stay, google_maps: mapsPlaceUrl(data.stay) }
      : data.stay,
    days_plan: data.days_plan.map((day) => ({
      ...day,
      google_maps_directions: mapsDayUrl(data, day.id),
      places: day.places.map((p) => ({
        ...p,
        google_maps: p.lat != null ? mapsPlaceUrl(p) : undefined,
      })),
    })),
  }
}
