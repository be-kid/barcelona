# Supabase Edge Function: chat-ai
# Deploy: supabase functions deploy chat-ai --no-verify-jwt=false
# Secrets: supabase secrets set OPENAI_API_KEY=sk-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Place = {
  id?: string
  locked?: boolean
  lat?: number | null
  lng?: number | null
  [key: string]: unknown
}

type DayPlan = {
  id: string
  locked?: boolean
  places: Place[]
  [key: string]: unknown
}

type Itinerary = {
  stay?: { locked?: boolean; [key: string]: unknown }
  constraints?: string[]
  days_plan: DayPlan[]
  [key: string]: unknown
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'unauthorized' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: 'unauthorized' }, 401)
    }

    const body = await req.json()
    const tripId = body.trip_id as string
    const message = String(body.message || '').trim()
    const focusDay = (body.focus_day as string | null) || null
    if (!tripId || !message) {
      return json({ error: 'trip_id and message required' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: member } = await admin
      .from('trip_members')
      .select('role')
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return json({ error: 'forbidden' }, 403)
    }

    const { data: itinRow, error: itinError } = await admin
      .from('itineraries')
      .select('data, version')
      .eq('trip_id', tripId)
      .single()

    if (itinError || !itinRow) {
      return json({ error: 'itinerary not found' }, 404)
    }

    const itinerary = itinRow.data as Itinerary
    const version = itinRow.version as number

    const { data: recent } = await admin
      .from('messages')
      .select('role, content, focus_day')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(12)

    await admin.from('messages').insert({
      trip_id: tripId,
      role: 'user',
      user_id: user.id,
      content: message,
      focus_day: focusDay,
    })

    if (!openaiKey) {
      const assistant_message =
        'OPENAI_API_KEY가 아직 없습니다. Supabase secrets에 키를 넣거나 프론트 목업 모드로 개발하세요.'
      await admin.from('messages').insert({
        trip_id: tripId,
        role: 'assistant',
        content: assistant_message,
        focus_day: focusDay,
        diff_summary: [],
      })
      return json({
        assistant_message,
        itinerary,
        diff_summary: [],
        needs_clarification: true,
        version,
      })
    }

    const compact = compactItinerary(itinerary, focusDay)
    const system = `당신은 커플 여행 일정 편집 조수입니다.
규칙:
1) locked:true 인 stay/day/place 는 절대 변경하지 마세요.
2) 전체 일정을 다시 쓰지 말고, 요청된 날짜/슬롯만 수정하세요.
3) 응답은 JSON만: {"assistant_message":"...","itinerary":{전체일정},"diff_summary":["..."],"needs_clarification":false}
4) itinerary 스키마를 유지하고 places 의 order를 1부터 다시 매기세요.
5) 좌표가 불확실하면 needs_clarification=true 로 질문하고 itinerary는 기존 유지.
constraints: ${(itinerary.constraints || []).join(' | ')}
focus_day: ${focusDay || 'none'}`

    const history = (recent || [])
      .reverse()
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `현재 일정 JSON:\n${JSON.stringify(compact)}\n\n최근 대화:\n${history}\n\n사용자: ${message}`,
          },
        ],
      }),
    })

    if (!completion.ok) {
      const errText = await completion.text()
      return json({ error: 'openai_failed', detail: errText }, 500)
    }

    const completionJson = await completion.json()
    const raw = completionJson.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw) as {
      assistant_message?: string
      itinerary?: Itinerary
      diff_summary?: string[]
      needs_clarification?: boolean
    }

    const assistant_message = parsed.assistant_message || '반영했습니다.'
    const diff_summary = parsed.diff_summary || []
    const needs_clarification = Boolean(parsed.needs_clarification)

    let nextItinerary = itinerary
    let nextVersion = version

    if (!needs_clarification && parsed.itinerary) {
      assertNoLockedMutation(itinerary, parsed.itinerary)
      nextItinerary = parsed.itinerary
      nextVersion = version + 1
      const { error: updateError } = await admin
        .from('itineraries')
        .update({
          data: nextItinerary,
          version: nextVersion,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('trip_id', tripId)
        .eq('version', version)

      if (updateError) {
        return json({ error: 'version_conflict', detail: updateError.message }, 409)
      }
    }

    await admin.from('messages').insert({
      trip_id: tripId,
      role: 'assistant',
      content: assistant_message,
      focus_day: focusDay,
      diff_summary,
    })

    const usage = completionJson.usage
    if (usage) {
      await admin.from('ai_runs').insert({
        trip_id: tripId,
        model: 'gpt-4.1-mini',
        input_tokens: usage.prompt_tokens ?? null,
        output_tokens: usage.completion_tokens ?? null,
      })
    }

    return json({
      assistant_message,
      itinerary: nextItinerary,
      diff_summary,
      needs_clarification,
      version: nextVersion,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function compactItinerary(itinerary: Itinerary, focusDay: string | null) {
  if (!focusDay) return itinerary
  return {
    ...itinerary,
    days_plan: itinerary.days_plan.map((d) =>
      d.id === focusDay
        ? d
        : {
            id: d.id,
            day: d.day,
            label: d.label,
            title: d.title,
            locked: d.locked,
            places: (d.places || []).filter((p) => p.locked),
          },
    ),
  }
}

function assertNoLockedMutation(before: Itinerary, after: Itinerary) {
  if (before.stay?.locked) {
    const b = JSON.stringify(pickStay(before.stay))
    const a = JSON.stringify(pickStay(after.stay))
    if (b !== a) throw new Error('locked stay mutated')
  }

  for (const day of before.days_plan) {
    const nextDay = after.days_plan.find((d) => d.id === day.id)
    if (!nextDay) throw new Error(`missing day ${day.id}`)
    if (day.locked) {
      if (day.title !== nextDay.title || day.theme !== nextDay.theme) {
        throw new Error(`locked day meta mutated: ${day.id}`)
      }
    }
    for (const place of day.places || []) {
      if (!place.locked) continue
      const nextPlace = (nextDay.places || []).find((p) => p.id === place.id)
      if (!nextPlace) throw new Error(`locked place removed: ${place.id}`)
      if (
        place.name !== nextPlace.name ||
        place.lat !== nextPlace.lat ||
        place.lng !== nextPlace.lng ||
        place.time !== nextPlace.time
      ) {
        throw new Error(`locked place mutated: ${place.id}`)
      }
    }
  }
}

function pickStay(stay: Record<string, unknown> | undefined) {
  if (!stay) return null
  return {
    name: stay.name,
    address: stay.address,
    lat: stay.lat,
    lng: stay.lng,
    locked: stay.locked,
  }
}
