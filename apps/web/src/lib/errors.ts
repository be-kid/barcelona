import type { PostgrestError } from '@supabase/supabase-js'

export function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') return '알 수 없는 오류'
  const e = err as PostgrestError & { message?: string; details?: string; hint?: string }
  const parts = [e.message, e.details, e.hint].filter(Boolean)
  if (parts.length) return parts.join(' — ')
  if (err instanceof Error) return err.message
  return String(err)
}

type FunctionErrorBody = {
  error?: string
  detail?: string
}

function formatFunctionErrorBody(body: FunctionErrorBody, status?: number): string {
  const code = body.error || (status ? `HTTP ${status}` : 'unknown')
  const detail = body.detail?.trim()

  if (code === 'itinerary not found') {
    return 'Supabase에 일정이 없어요. SQL Editor에서 trips 행과 supabase/seed/002_itinerary_data.sql 을 실행하세요.'
  }
  if (code === 'openai_failed') {
    if (detail?.includes('insufficient_quota')) {
      return 'OpenAI 크레딧/한도가 부족해요. platform.openai.com → Billing 에서 잔액을 확인하세요.'
    }
    if (detail?.includes('invalid_api_key')) {
      return 'OpenAI API 키가 잘못됐어요. supabase secrets set OPENAI_API_KEY=... 후 chat-ai 를 다시 deploy 하세요.'
    }
    if (detail) return `OpenAI 오류: ${shorten(detail, 280)}`
    return 'OpenAI 호출에 실패했어요. API 키와 Billing 을 확인하세요.'
  }
  if (code === 'forbidden') return '이 여행 멤버가 아니에요. 초대 코드로 다시 가입해 보세요.'
  if (code === 'unauthorized') return '로그인이 만료됐을 수 있어요. 새로고침 후 다시 로그인하세요.'
  if (code === 'version_conflict') return '일정이 다른 쪽에서 바뀌었어요. 새로고침 후 다시 시도하세요.'
  if (code === 'trip_id and message required') {
    return 'VITE_TRIP_ID 가 비어 있거나 요청이 잘못됐어요. .env.local 을 확인하세요.'
  }
  if (detail) return `${code}: ${shorten(detail, 200)}`
  return code
}

function shorten(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readHttpErrorBody(response: Response): Promise<FunctionErrorBody | null> {
  try {
    const cloned = response.clone()
    const contentType = cloned.headers.get('Content-Type') ?? ''
    if (contentType.includes('application/json')) {
      const body = (await cloned.json()) as unknown
      if (isRecord(body) && typeof body.error === 'string') {
        return {
          error: body.error,
          detail: typeof body.detail === 'string' ? body.detail : undefined,
        }
      }
      if (isRecord(body) && typeof body.message === 'string') {
        return { error: body.message }
      }
      return { error: `HTTP ${response.status}`, detail: JSON.stringify(body) }
    }

    const text = (await cloned.text()).trim()
    if (text) return { error: `HTTP ${response.status}`, detail: text }
    return { error: `HTTP ${response.status}` }
  } catch {
    return { error: `HTTP ${response.status}` }
  }
}

function getErrorResponse(error: unknown, response?: Response): Response | undefined {
  if (response) return response
  if (!isRecord(error)) return undefined
  if (error.context instanceof Response) return error.context
  return undefined
}

function relayOrFetchMessage(error: unknown): string | null {
  if (!isRecord(error)) return null
  const name = typeof error.name === 'string' ? error.name : ''
  if (name === 'FunctionsRelayError') {
    return 'Supabase Edge Function 연결 실패. Dashboard → Functions 에서 chat-ai 가 배포됐는지 확인하세요.'
  }
  if (name === 'FunctionsFetchError') {
    return '네트워크 오류로 chat-ai 에 연결하지 못했어요.'
  }
  return null
}

export async function formatFunctionsInvokeError(
  error: unknown,
  data: unknown,
  response?: Response,
): Promise<string> {
  if (isRecord(data) && typeof data.error === 'string') {
    return formatFunctionErrorBody({
      error: data.error,
      detail: typeof data.detail === 'string' ? data.detail : undefined,
    })
  }

  const httpResponse = getErrorResponse(error, response)
  if (httpResponse) {
    const body = await readHttpErrorBody(httpResponse)
    if (body) return formatFunctionErrorBody(body, httpResponse.status)
  }

  const relay = relayOrFetchMessage(error)
  if (relay) return relay

  if (error instanceof Error && !error.message.includes('non-2xx')) {
    return error.message
  }

  return '채팅 서버 오류. Supabase Functions 로그와 DB 시드(itineraries)를 확인하세요.'
}
