import type { PostgrestError } from '@supabase/supabase-js'

export function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return '알 수 없는 오류'
  const e = err as PostgrestError & { message?: string; details?: string; hint?: string }
  const parts = [e.message, e.details, e.hint].filter(Boolean)
  if (parts.length) return parts.join(' — ')
  if (err instanceof Error) return err.message
  return String(err)
}
