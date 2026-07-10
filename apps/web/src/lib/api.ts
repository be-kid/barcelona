import type { ChatMessage, ChatResponse, Itinerary } from '../types'
import { enrichItinerary } from './maps'
import { mockChat } from './mockChat'
import { isSupabaseConfigured, supabase, tripId, useMockAi } from './supabase'

export async function loadItinerary(): Promise<Itinerary> {
  if (supabase && tripId) {
    const { data, error } = await supabase
      .from('itineraries')
      .select('data')
      .eq('trip_id', tripId)
      .single()
    if (!error && data?.data) {
      return enrichItinerary(data.data as Itinerary)
    }
  }

  const res = await fetch('/itinerary.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('일정을 불러오지 못했습니다.')
  return enrichItinerary(await res.json())
}

export async function loadMessages(): Promise<ChatMessage[]> {
  if (!supabase || !tripId) return []
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, focus_day, diff_summary, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error || !data) return []
  return data as ChatMessage[]
}

export async function sendChat(opts: {
  itinerary: Itinerary
  message: string
  focusDay?: string | null
}): Promise<ChatResponse> {
  if (useMockAi || !supabase) {
    return mockChat(opts.itinerary, opts.message, opts.focusDay)
  }

  const { data, error } = await supabase.functions.invoke('chat-ai', {
    body: {
      trip_id: tripId,
      message: opts.message,
      focus_day: opts.focusDay,
    },
  })

  if (error) {
    throw new Error(error.message || 'chat-ai 호출 실패')
  }

  const payload = data as ChatResponse
  return {
    ...payload,
    itinerary: enrichItinerary(payload.itinerary),
  }
}

export function subscribeItinerary(
  onChange: (itinerary: Itinerary) => void,
): (() => void) | null {
  if (!supabase || !tripId || !isSupabaseConfigured) return null

  const channel = supabase
    .channel(`itinerary:${tripId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'itineraries',
        filter: `trip_id=eq.${tripId}`,
      },
      (payload) => {
        const row = payload.new as { data?: Itinerary }
        if (row.data) onChange(enrichItinerary(row.data))
      },
    )
    .subscribe()

  return () => {
    void supabase!.removeChannel(channel)
  }
}

export function subscribeMessages(
  onInsert: (msg: ChatMessage) => void,
): (() => void) | null {
  if (!supabase || !tripId || !isSupabaseConfigured) return null

  const channel = supabase
    .channel(`messages:${tripId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `trip_id=eq.${tripId}`,
      },
      (payload) => {
        onInsert(payload.new as ChatMessage)
      },
    )
    .subscribe()

  return () => {
    void supabase!.removeChannel(channel)
  }
}
