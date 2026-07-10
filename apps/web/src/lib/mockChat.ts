import type { ChatResponse, Itinerary, Place } from '../types'
import { enrichItinerary } from './maps'

/**
 * OpenAI 없이 UI/동선 개발용 목업.
 * 간단한 한국어 명령을 일정 패치로 변환한다.
 */
export async function mockChat(
  itinerary: Itinerary,
  message: string,
  focusDay?: string | null,
): Promise<ChatResponse> {
  await new Promise((r) => setTimeout(r, 450))

  const dayId = focusDay || itinerary.days_plan.find((d) => !d.locked)?.id || itinerary.days_plan[0]?.id
  const day = itinerary.days_plan.find((d) => d.id === dayId)
  if (!day) {
    return {
      assistant_message: '편집할 날짜를 찾지 못했어요. Day 탭을 골라 주세요.',
      itinerary,
      diff_summary: [],
      needs_clarification: true,
    }
  }

  const next = structuredClone(itinerary) as Itinerary
  const target = next.days_plan.find((d) => d.id === day.id)!
  const diff: string[] = []

  // Fill empty dinner/lunch slots with a placeholder near stay
  const fillSlot = (slot: Place['slot'], name: string, note: string) => {
    const existing = target.places.find((p) => p.slot === slot && p.lat == null)
    const stay = next.stay
    if (existing && stay) {
      existing.name = name
      existing.name_en = name
      existing.lat = stay.lat + (slot === 'dinner' ? -0.004 : 0.003)
      existing.lng = stay.lng + 0.004
      existing.note = note
      existing.source = 'ai_fill'
      diff.push(`${target.label}: ${slot} → ${name}`)
      return true
    }
    if (!existing) {
      const order = target.places.length + 1
      target.places.push({
        id: `${day.id}_${slot}_${order}`,
        order,
        name,
        name_en: name,
        lat: stay ? stay.lat + 0.002 : 41.39,
        lng: stay ? stay.lng + 0.003 : 2.16,
        time: slot === 'lunch' ? '점심' : slot === 'dinner' ? '저녁' : '오후',
        duration: '60–90분',
        note,
        slot,
        locked: false,
        source: 'ai_fill',
      })
      diff.push(`${target.label}: ${name} 추가`)
      return true
    }
    return false
  }

  if (/해변|비치|바르셀로네타|beach/i.test(message)) {
    const order = target.places.length + 1
    target.places.push({
      id: `${day.id}_beach_${order}`,
      order,
      name: '바르셀로네타 해변',
      name_en: 'Barceloneta Beach',
      lat: 41.3785,
      lng: 2.1925,
      time: '오후',
      duration: '90분',
      note: '목업 제안 — 실제 AI 연동 전 테스트용.',
      slot: 'afternoon',
      locked: false,
      source: 'ai_fill',
    })
    if (!target.title.includes('해변') && !target.locked) {
      target.title = `${target.title.replace('미정', '').trim() || target.label} · 해변`
      target.theme = '해변'
    }
    diff.push(`${target.label}: 바르셀로네타 추가`)
  } else if (/점심|lunch/i.test(message)) {
    fillSlot('lunch', '점심 (숙소 근처 제안)', '목업 — 에이샴플레 근처 식사 슬롯을 채웠어요.')
  } else if (/저녁|dinner|타파스/i.test(message)) {
    fillSlot('dinner', '저녁 타파스 (제안)', '목업 — 저녁 슬롯을 채웠어요. 나중에 식당명으로 바꾸면 됩니다.')
  } else if (/몬주익|montjuic|mnac/i.test(message)) {
    target.places.push(
      {
        id: `${day.id}_mnac`,
        order: target.places.length + 1,
        name: 'MNAC / 몬주익',
        name_en: 'MNAC',
        lat: 41.3683,
        lng: 2.1535,
        time: '오후',
        duration: '90분',
        note: '목업 제안.',
        locked: false,
        source: 'ai_fill',
      },
    )
    if (!target.locked) {
      target.title = '몬주익'
      target.theme = '언덕 · 미술관'
    }
    diff.push(`${target.label}: 몬주익 추가`)
  } else if (/비워|초기화|clear/i.test(message) && !target.locked) {
    const before = target.places.length
    target.places = target.places.filter((p) => p.locked)
    diff.push(`${target.label}: 미고정 스팟 ${before - target.places.length}개 제거`)
  } else {
    return {
      assistant_message:
        `지금은 목업 AI예요. "${day.label}" 기준으로 예를 들어\n` +
        `· "점심 채워줘"\n· "저녁 타파스"\n· "해변 넣어줘"\n· "몬주익"\n` +
        `처럼 말해 보세요. Supabase+OpenAI 연결 후 진짜 대화로 바뀝니다.`,
      itinerary: enrichItinerary(itinerary),
      diff_summary: [],
      needs_clarification: true,
    }
  }

  // renumber
  target.places.forEach((p, i) => {
    p.order = i + 1
  })

  return {
    assistant_message: diff.length
      ? `${day.label}에 반영해 봤어요.\n${diff.map((x) => `· ${x}`).join('\n')}\n\n(목업 AI — OpenAI 연동 전)`
      : '변경할 내용을 이해하지 못했어요.',
    itinerary: enrichItinerary(next),
    diff_summary: diff,
    needs_clarification: false,
  }
}
