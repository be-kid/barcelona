import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { InviteJoinPage } from './components/InviteJoinPage'
import { ItineraryPanel } from './components/ItineraryPanel'
import { LoginPage } from './components/LoginPage'
import { MapView } from './components/MapView'
import { useAuth } from './hooks/useAuth'
import {
  loadItinerary,
  loadMessages,
  sendChat,
  subscribeItinerary,
  subscribeMessages,
} from './lib/api'
import { signOut, useMockAi, type TripMembership } from './lib/supabase'
import type { ChatMessage, Itinerary } from './types'
import './App.css'

function uid() {
  return crypto.randomUUID()
}

function PlannerApp({
  membership,
  userEmail,
}: {
  membership: TripMembership | null
  userEmail?: string
}) {
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
      // assistant만: user는 DB/응답 동기화로 (Realtime user 중복 방지)
      if (msg.role !== 'assistant') return
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    })
    return () => {
      unsubI?.()
      unsubM?.()
    }
  }, [])

  // 새로고침 직후에만: 서버가 아직 답 생성 중이면 DB에서 회수 (전송마다 돌리지 않음)
  useEffect(() => {
    if (useMockAi) return
    let cancelled = false
    let attempts = 0

    const tick = async () => {
      if (cancelled || attempts >= 20) return
      attempts += 1
      try {
        const msgs = await loadMessages()
        if (cancelled) return
        const last = msgs.at(-1)
        if (!last || last.role !== 'user') return
        const age = Date.now() - new Date(last.created_at).getTime()
        if (age > 3 * 60_000) return

        setMessages(msgs)
        if (msgs.at(-1)?.role === 'assistant') {
          setItinerary(await loadItinerary())
          return
        }
        setTimeout(tick, 3000)
      } catch {
        // ignore
      }
    }

    void (async () => {
      const msgs = await loadMessages()
      if (cancelled) return
      const last = msgs.at(-1)
      if (last?.role === 'user') {
        const age = Date.now() - new Date(last.created_at).getTime()
        if (age <= 3 * 60_000) setTimeout(tick, 3000)
      }
    })()

    return () => {
      cancelled = true
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
      const now = new Date().toISOString()
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'user',
          content: text,
          focus_day: dayId,
          created_at: now,
        },
      ])
      try {
        const res = await sendChat({ itinerary, message: text, focusDay: dayId })
        if (useMockAi) {
          setItinerary(res.itinerary)
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'assistant',
              content: res.assistant_message,
              focus_day: dayId,
              diff_summary: res.diff_summary,
              created_at: now,
            },
          ])
        } else {
          setItinerary(await loadItinerary())
          setMessages(await loadMessages())
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

  const displayName = membership?.display_name || userEmail?.split('@')[0] || '나'

  return (
    <div className="app-shell">
      <ItineraryPanel
        itinerary={itinerary}
        dayId={day.id}
        onSelectDay={setDayId}
        onFocusPlace={setFocusPlaceId}
        userLabel={displayName}
        onSignOut={membership ? () => void signOut() : undefined}
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

export default function App() {
  const { auth, recheck } = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="boot-error">
        <p>확인 중…</p>
      </div>
    )
  }

  if (auth.status === 'no_supabase') {
    return <PlannerApp membership={null} />
  }

  if (auth.status === 'anonymous') {
    return <LoginPage />
  }

  if (auth.status === 'needs_invite') {
    return (
      <InviteJoinPage
        email={auth.email}
        onJoined={() => void recheck()}
      />
    )
  }

  if (auth.status === 'authenticated') {
    return (
      <PlannerApp
        membership={auth.membership}
        userEmail={auth.session.user.email}
      />
    )
  }

  return null
}
