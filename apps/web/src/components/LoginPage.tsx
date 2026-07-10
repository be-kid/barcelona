import { useState } from 'react'
import { signInWithMagicLink } from '../lib/supabase'

type Props = {
  onSent?: (email: string) => void
}

export function LoginPage({ onSent }: Props) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      await signInWithMagicLink(value)
      setSent(true)
      onSent?.(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 링크 전송 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">Barcelona · 우리 일정</p>
        <h1 className="brand">로그인</h1>
        <p className="lede">
          이메일로 <strong>매직 링크</strong>를 보내 드립니다. 비밀번호는 없어요.
        </p>

        {sent ? (
          <div className="auth-notice success">
            <strong>{email}</strong> 로 링크를 보냈어요.
            <br />
            메일함(스팸함 포함)에서 링크를 눌러 들어오세요.
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
            <button type="submit" className="btn primary block" disabled={busy || !email.trim()}>
              {busy ? '보내는 중…' : '로그인 링크 받기'}
            </button>
          </form>
        )}

        {error ? <p className="auth-error">{error}</p> : null}

        <p className="auth-foot">
          처음이면 링크 클릭 후 <strong>초대 코드</strong>로 trip에 합류합니다. (주인은 SQL로 owner
          등록)
        </p>
      </div>
    </div>
  )
}
