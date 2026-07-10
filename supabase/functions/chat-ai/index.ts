// Supabase Edge Function: chat-ai
// Deploy: supabase functions deploy chat-ai
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...

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
    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini'

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
      return json(
        {
          error: 'itinerary not found',
          detail: 'trips row + supabase/seed/002_itinerary_data.sql required',
        },
        404,
      )
    }

    const itinerary = itinRow.data as Itinerary
    const version = itinRow.version as number

    const { data: recent } = await admin
      .from('messages')
      .select('role, content, focus_day')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(6)

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
1) locked:true 인 stay/place 는 기본적으로 바꾸지 마세요. (사용자가 "확정 취소/일정 변경"을 명시하면 해당 항목만 수정)
2) focus_day가 있으면 그 날짜만 수정하세요. 다른 Day는 건드리지 마세요.
3) 응답 JSON의 itinerary.days_plan[0].id 는 focus_day 와 같게 (예: "day4").
4) 응답 형식: {"assistant_message":"...","itinerary":{"days_plan":[{...}]},"diff_summary":["..."],"needs_clarification":false}
5) places 의 order는 1부터, lat/lng 포함. 좌표가 애매하면 needs_clarification=true 로 두고 itinerary는 기존 유지.
6) assistant_message 는 비개발자용 한국어로만 작성. needs_clarification, lat, lng, JSON, itinerary 같은 기술 용어는 절대 쓰지 마세요.
   위치가 불확실하면 예: "○○ 맞죠? 구글맵에 나오는 장소 이름(또는 주소)을 알려주시면 지도에 반영할게요." 처럼 친절히 질문하세요.
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
        model: openaiModel,
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

    const assistant_message0 = parsed.assistant_message || '반영했습니다.'
    let needs_clarification = Boolean(parsed.needs_clarification)
    let assistant_message = polishAssistantMessage(
      assistant_message0,
      needs_clarification,
      message,
    )

    const diff_summary = parsed.diff_summary || []

    let nextItinerary = itinerary
    let nextVersion = version
    let applied = false

    if (!needs_clarification && parsed.itinerary) {
      const aiItinerary = normalizeAiItinerary(parsed.itinerary, focusDay)
      if (aiItinerary) {
        const patched = applyItineraryPatch(itinerary, aiItinerary, focusDay)
        if (!itinerariesEqual(itinerary, patched)) {
          nextItinerary = patched
          nextVersion = version + 1
          applied = true
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
      }
    }

    if (!needs_clarification && !applied) {
      needs_clarification = true
      assistant_message =
        '요청은 이해했는데 일정 반영에 실패했어요. 지금 선택한 Day 탭에서 조금 더 구체적으로 다시 보내 주세요. (예: 장소 이름, 시간대)'
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
        model: openaiModel,
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

function polishAssistantMessage(
  message: string,
  needsClarification: boolean,
  userMessage: string,
): string {
  const technical =
    /needs_clarification|diff_summary|focus_day|\bitinerary\b|\bjson\b|\blat\b|\blng\b|좌표가?\s*필요|정확한\s*좌표/i.test(
      message,
    )

  let text = message
    .replace(/needs_clarification\s*(유지|true|false)?/gi, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!needsClarification) {
    return text || '반영했습니다.'
  }

  const hint = userMessage.trim().slice(0, 48)
  const placeLike =
    /맛집|카페|식당|장소|해변|시장|박물관|공원|바|레스토랑|구역|동네|역|hotel|restaurant/i.test(
      userMessage,
    )

  if (technical || /좌표|위치.*불확실|lat|lng/i.test(message)) {
    if (hint) {
      return `「${hint}」 넣으려는 거 맞죠? 지도에 정확히 찍으려면 구글맵에 보이는 장소 이름이나 주소를 알려주세요. 그러면 바로 반영할게요.`
    }
    return '지도에 정확히 넣으려면 구글맵에 보이는 장소 이름이나 대략적인 위치(동네·역 이름)를 알려주세요. 그러면 바로 반영할게요.'
  }

  if (placeLike && (text.length < 15 || !/[?？]|주세요|알려|말씀/.test(text))) {
    return hint
      ? `「${hint}」 좋아요! 몇 시쯤 갈지, 또는 구글맵 장소 이름을 알려주시면 일정에 넣을게요.`
      : '좋아요! 몇 시쯤 갈지와 장소 이름(구글맵에 나오는 그대로)을 알려주시면 일정에 넣을게요.'
  }

  if (text.length < 12 || technical) {
    return '조금만 더 구체적으로 말해 주시면 반영할게요. 예: 오후에 보케리아 시장, 저녁 8시 타파스 바처럼 시간과 장소를 함께 적어 주세요.'
  }

  if (!/[?？]|주세요|알려|말씀|확인/.test(text)) {
    text += ' 조금만 더 알려주시면 바로 반영할게요.'
  }

  return text
}

function compactItinerary(itinerary: Itinerary, focusDay: string | null) {
  const base = {
    title: itinerary.title,
    constraints: itinerary.constraints,
    stay: itinerary.stay
      ? {
          name: itinerary.stay.name,
          lat: itinerary.stay.lat,
          lng: itinerary.stay.lng,
          locked: itinerary.stay.locked,
        }
      : undefined,
  }

  if (!focusDay) {
    return {
      ...base,
      days_plan: (itinerary.days_plan ?? []).map((d) => ({
        id: d.id,
        label: d.label,
        title: d.title,
        locked: d.locked,
      })),
    }
  }

  const day = (itinerary.days_plan ?? []).find((d) => d.id === focusDay)
  return {
    ...base,
    focus_day: focusDay,
    days_plan: day ? [day] : [],
  }
}

function normalizeAiItinerary(
  raw: Itinerary | undefined,
  focusDay: string | null,
): Itinerary | null {
  if (!raw || !Array.isArray(raw.days_plan) || raw.days_plan.length === 0) {
    return null
  }

  const days = raw.days_plan.map((day, index) => {
    const id =
      day.id ||
      (raw.days_plan!.length === 1 && focusDay ? focusDay : `day${index + 1}`)
    const places = (Array.isArray(day.places) ? day.places : []).map((p, i) => ({
      ...p,
      order: p.order ?? i + 1,
    }))
    return { ...day, id, places }
  })

  if (focusDay && days.length === 1 && days[0].id !== focusDay) {
    days[0] = { ...days[0], id: focusDay }
  }

  return { ...raw, days_plan: days }
}

function itinerariesEqual(a: Itinerary, b: Itinerary): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function applyItineraryPatch(
  before: Itinerary,
  after: Itinerary,
  focusDay: string | null,
): Itinerary {
  if (!focusDay) {
    return mergeLockedItinerary(before, after)
  }

  const afterDay = (after.days_plan ?? []).find((d) => d.id === focusDay)
  if (!afterDay) return before

  return {
    ...before,
    days_plan: (before.days_plan ?? []).map((day) => {
      if (day.id !== focusDay) return day
      if (day.locked) {
        return {
          ...day,
          summary: afterDay.summary ?? day.summary,
          tips: afterDay.tips ?? day.tips,
          places: mergeDayPlaces(day, afterDay),
        }
      }
      return {
        ...day,
        title: afterDay.title ?? day.title,
        theme: afterDay.theme ?? day.theme,
        summary: afterDay.summary ?? day.summary,
        tips: afterDay.tips ?? day.tips,
        places: afterDay.places ?? [],
      }
    }),
  }
}

function mergeLockedItinerary(before: Itinerary, after: Itinerary): Itinerary {
  const afterDays = new Map((after.days_plan ?? []).map((d) => [d.id, d]))

  return {
    ...after,
    stay: before.stay?.locked ? { ...before.stay } : after.stay ?? before.stay,
    constraints: before.constraints ?? after.constraints,
    days_plan: (before.days_plan ?? []).map((day) => {
      const afterDay = afterDays.get(day.id)
      if (!afterDay) return { ...day }
      if (!day.locked) return afterDay
      return {
        ...afterDay,
        day: day.day,
        date: day.date,
        label: day.label,
        title: day.title,
        theme: day.theme,
        locked: day.locked,
        summary: day.summary,
        tips: day.tips,
        places: mergeDayPlaces(day, afterDay),
      }
    }),
  }
}

function mergeDayPlaces(
  beforeDay: DayPlan,
  afterDay: DayPlan,
): Place[] {
  const lockedIds = new Set(
    (beforeDay.places || []).filter((p) => p.locked).map((p) => p.id),
  )
  const lockedPlaces = (beforeDay.places || []).filter((p) => p.locked)
  const beforeUnlocked = (beforeDay.places || []).filter((p) => !p.locked)
  const afterPlaces = afterDay.places || []
  const afterById = new Map(
    afterPlaces
      .filter((p) => p.id && !lockedIds.has(p.id))
      .map((p) => [p.id as string, p]),
  )

  const merged: Place[] = [...lockedPlaces]
  for (const place of beforeUnlocked) {
    const id = place.id
    if (id && afterById.has(id)) {
      merged.push(afterById.get(id)!)
      afterById.delete(id)
    } else {
      merged.push(place)
    }
  }
  for (const place of afterById.values()) {
    merged.push(place)
  }
  for (const place of afterPlaces) {
    if (!place.id && !place.locked) merged.push(place)
  }

  return merged.map((place, index) => ({ ...place, order: index + 1 }))
}
