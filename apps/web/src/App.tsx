import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { ItineraryPanel } from './components/ItineraryPanel'
import { MapView } from './components/MapView'
import {
  loadItinerary,
  loadMessages,
  sendChat,
  subscribeItinerary,
  subscribeMessages,
} from './lib/api'
import { useMockAi } from './lib/supabase'
import type { ChatMessage, Itinerary } from './types'
import './App.css'

function uid() {
  return crypto.randomUUID()
}

export default function App() {
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [dayId, setDayId] = useState('day1')
  const [focusPlaceId, setFocusPlaceId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadItinerary()
        if (cancelled) return
        setItinerary(data)
        setDayId(data.days_plan[0]?.id || 'day1')
        const msgs = await loadMessages()
        if (!cancelled) setMessages(msgs)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '로드 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsubI = subscribeItinerary((data) => setItinerary(data))
    const unsubM = subscribeMessages((msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    })
    return () => {
      unsubI?.()
      unsubM?.()
    }
  }, [])

  const day = useMemo(
    () => itinerary?.days_plan.find((d) => d.id === dayId) || itinerary?.days_plan[0] || null,
    [itinerary, dayId],
  )

  const onSend = useCallback(
    async (text: string) => {
      if (!itinerary) return
      setBusy(true)
      setError(null)
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: text,
        focus_day: dayId,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      try {
        const res = await sendChat({ itinerary, message: text, focusDay: dayId })
        setItinerary(res.itinerary)
        if (useMockAi) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'assistant',
              content: res.assistant_message,
              focus_day: dayId,
              diff_summary: res.diff_summary,
              created_at: new Date().toISOString(),
            },
          ])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '채팅 실패')
      } finally {
        setBusy(false)
      }
    },
    [itinerary, dayId],
  )

  if (error && !itinerary) {
    return (
      <div className="boot-error">
        <p>{error}</p>
      </div>
    )
  }

  if (!itinerary || !day) {
    return (
      <div className="boot-error">
        <p>일정 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <ItineraryPanel
        itinerary={itinerary}
        dayId={day.id}
        onSelectDay={setDayId}
        onFocusPlace={setFocusPlaceId}
      />
      <main className="map-pane">
        <MapView day={day} stay={itinerary.stay} focusPlaceId={focusPlaceId} />
        {error ? <div className="toast error">{error}</div> : null}
        {useMockAi ? <div className="toast mode">목업 AI</div> : null}
      </main>
      <ChatPanel
        messages={messages}
        focusDay={day.id}
        dayLabel={day.label}
        busy={busy}
        onSend={onSend}
      />
    </div>
  )
}
