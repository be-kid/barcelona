import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  getSession,
  getTripMembership,
  isSupabaseConfigured,
  supabase,
  type TripMembership,
} from '../lib/supabase'

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'no_supabase' }
  | { status: 'authenticated'; session: Session; membership: TripMembership }
  | { status: 'needs_invite'; session: Session; email: string }

async function resolveAuth(session: Session | null): Promise<AuthState> {
  if (!session?.user) return { status: 'anonymous' }
  try {
    const membership = await getTripMembership(session.user.id)
    if (membership) {
      return { status: 'authenticated', session, membership }
    }
  } catch (e) {
    console.error('resolveAuth membership', e)
  }
  return {
    status: 'needs_invite',
    session,
    email: session.user.email || '',
  }
}

export function useAuth(): {
  auth: AuthState
  recheck: () => Promise<void>
} {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  const sync = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setAuth({ status: 'no_supabase' })
      return
    }
    const session = await getSession()
    setAuth(await resolveAuth(session))
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuth({ status: 'no_supabase' })
      return
    }

    void sync()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void sync()
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [sync])

  return { auth, recheck: sync }
}
