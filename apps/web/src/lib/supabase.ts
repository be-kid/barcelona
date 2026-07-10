import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const tripId = import.meta.env.VITE_TRIP_ID || ''

/** true면 Edge Function 대신 로컬 규칙 기반 목업 AI 사용 */
export const useMockAi =
  import.meta.env.VITE_USE_MOCK_AI === 'true' || !isSupabaseConfigured

export type TripMembership = {
  role: 'owner' | 'member'
  display_name: string | null
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function signInWithMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.')
  const redirectTo = `${window.location.origin}${window.location.pathname}`
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getTripMembership(userId: string): Promise<TripMembership | null> {
  if (!supabase || !tripId) return null
  const { data, error } = await supabase
    .from('trip_members')
    .select('role, display_name')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as TripMembership
}

export async function joinTripWithInvite(inviteCode: string, displayName?: string): Promise<void> {
  if (!supabase || !tripId) throw new Error('Supabase trip 설정이 없습니다.')
  const { error } = await supabase.rpc('join_trip_with_invite', {
    p_trip_id: tripId,
    p_invite_code: inviteCode.trim(),
    p_display_name: displayName?.trim() || null,
  })
  if (error) throw error
}

export async function getTripInviteHint(): Promise<string | null> {
  if (!supabase || !tripId) return null
  const { data } = await supabase
    .from('trips')
    .select('invite_code')
    .eq('id', tripId)
    .maybeSingle()
  return data?.invite_code ?? null
}
