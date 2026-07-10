import { useState } from 'react'
import { joinTripWithInvite, signOut } from '../lib/supabase'
import { formatSupabaseError } from '../lib/errors'

type Props = {
  email: string
  onJoined: () => void
}

export function InviteJoinPage({ email, onJoined }: Props) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await joinTripWithInvite(code, name || undefined)
      onJoined()
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">거의 다 왔어요</p>
        <h1 className="brand">초대 코드</h1>
        <p className="lede">
          <strong>{email}</strong> 로 로그인됐어요. 초대 코드는 같이 여행 짜는 사람에게 받으면 됩니다.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="code">초대 코드</label>
          <input
            id="code"
            type="text"
            placeholder="파트너에게 받은 코드"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            required
          />
          <label htmlFor="name">표시 이름 (선택)</label>
          <input
            id="name"
            type="text"
            placeholder="채팅에 보일 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn primary block" disabled={busy || !code.trim()}>
            {busy ? '확인 중…' : '들어가기'}
          </button>
        </form>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="button" className="btn ghost block" onClick={() => void signOut()}>
          다른 이메일로 로그인
        </button>
      </div>
    </div>
  )
}
