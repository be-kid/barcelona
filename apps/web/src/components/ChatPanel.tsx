import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'
import { useMockAi } from '../lib/supabase'

type Props = {
  messages: ChatMessage[]
  focusDay: string
  dayLabel: string
  busy: boolean
  onSend: (text: string) => Promise<void>
}

export function ChatPanel({ messages, focusDay, dayLabel, busy, onSend }: Props) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setText('')
    await onSend(value)
  }

  return (
    <aside className="panel chat-panel">
      <header className="panel-head chat-head">
        <p className="eyebrow">Chat · {dayLabel}</p>
        <h2 className="brand small">일정 짜기</h2>
        <p className="lede">
          {useMockAi
            ? '목업 AI 모드 (Supabase/OpenAI 키 없이 UI 개발용). focus: '
            : 'AI 편집 · focus: '}
          <code>{focusDay}</code>
        </p>
        {!useMockAi ? (
          <p className="chat-hint">
            고정(🔒) 일정은 「투어 취소했어」「이거 바꿔줘」처럼 <strong>명시</strong>해야 바뀝니다.
            비어 있는 Day·미정 슬롯은 지금 선택한 Day에서 자유롭게 채우면 됩니다.
          </p>
        ) : null}
      </header>

      <div className="chat-log">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>
              예: “{dayLabel}에 점심 채워줘”, “해변 넣어줘”, “몬주익”
            </p>
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            <div className="bubble-meta">{m.role === 'user' ? '나' : 'AI'}</div>
            <div className="bubble-body">{m.content}</div>
            {m.diff_summary && m.diff_summary.length > 0 ? (
              <ul className="diff">
                {m.diff_summary.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {busy ? <div className="bubble assistant dim">생각 중…</div> : null}
        <div ref={bottomRef} />
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`${dayLabel}에 대해 말해 보세요`}
          disabled={busy}
        />
        <button type="submit" className="btn primary" disabled={busy || !text.trim()}>
          보내기
        </button>
      </form>
    </aside>
  )
}
