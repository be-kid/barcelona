export type PlaceSlot =
  | 'morning'
  | 'lunch'
  | 'afternoon'
  | 'cafe'
  | 'dinner'
  | 'sunset'
  | 'between'
  | 'custom'

export interface Place {
  id: string
  order: number
  name: string
  name_en?: string | null
  lat?: number | null
  lng?: number | null
  time?: string | null
  duration?: string | null
  note?: string | null
  slot?: PlaceSlot
  locked?: boolean
  optional?: boolean
  exclude_from_route?: boolean
  source?: string
  google_maps?: string
}

export interface DayPlan {
  id: string
  day: number
  date?: string
  label: string
  title: string
  theme?: string
  locked?: boolean
  summary?: string
  tips?: string[]
  travelmode?: string
  places: Place[]
  google_maps_directions?: string
}

export interface Stay {
  name: string
  name_en?: string
  address?: string
  lat: number
  lng: number
  locked: boolean
  note?: string
  google_maps?: string
}

export interface Itinerary {
  title: string
  city: string
  nights: number
  days: number
  dates?: {
    arrival?: { date?: string; time_local?: string | null; place?: string; note?: string }
    departure?: { date?: string; time_local?: string | null; place?: string; note?: string }
    timezone?: string
  }
  share?: { note?: string }
  stay?: Stay
  constraints?: string[]
  assumptions?: Record<string, string>
  days_plan: DayPlan[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  focus_day?: string | null
  diff_summary?: string[] | null
  created_at: string
}

export interface ChatResponse {
  assistant_message: string
  itinerary: Itinerary
  diff_summary: string[]
  needs_clarification: boolean
  version?: number
}
