import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anon!)
  : null

export const tripId = import.meta.env.VITE_TRIP_ID || ''

/** true면 Edge Function 대신 로컬 규칙 기반 목업 AI 사용 */
export const useMockAi =
  import.meta.env.VITE_USE_MOCK_AI === 'true' || !isSupabaseConfigured
