import type { DayPlan, Itinerary, Place } from '../types'

const reservationLabels = {
  booked: ['예약 완료', 'booked'],
  recommended: ['예약 권장', 'recommended'],
  walk_in: ['워크인', 'walkin'],
  check: ['확인 필요', 'check'],
  optional: ['선택', 'optional'],
  none: ['예약 불필요', 'none'],
} as const

type Props = {
  itinerary: Itinerary
  dayId: string
  onSelectDay: (id: string) => void
  onFocusPlace: (id: string) => void
  userLabel?: string
  onSignOut?: () => void
}

function PlaceRow({
  place,
  onFocus,
}: {
  place: Place
  onFocus: () => void
}) {
  return (
    <li className="place" onClick={onFocus} onKeyDown={(e) => e.key === 'Enter' && onFocus()} tabIndex={0}>
      <span className="num">{place.order}</span>
      <div>
        <h3>
          {place.name}
          {place.locked ? <span className="badge lock">고정</span> : null}
          {place.optional ? <span className="badge opt">선택</span> : null}
          {place.lat == null ? <span className="badge opt">미정</span> : null}
        </h3>
        {place.reservation_status ? (
          <div className="place-status">
            <span className={`badge ${reservationLabels[place.reservation_status][1]}`}>
              {reservationLabels[place.reservation_status][0]}
            </span>
          </div>
        ) : null}
        <p className="meta">
          {place.time || ''} · {place.duration || ''}
        </p>
        <p className="note">{place.note}</p>
      </div>
      {place.google_maps ? (
        <a
          className="pin-link"
          href={place.google_maps}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          맵
        </a>
      ) : (
        <span className="pin-link muted">미정</span>
      )}
    </li>
  )
}

function DayBody({ day, onFocusPlace }: { day: DayPlan; onFocusPlace: (id: string) => void }) {
  return (
    <article className="day-card">
      <h2>{day.title}</h2>
      {day.date ? <p className="day-theme">{day.date}</p> : null}
      <p className="day-theme">{day.theme}</p>
      <p className="day-summary">{day.summary}</p>
      <ul className="places">
        {day.places.length === 0 ? (
          <li className="place empty">
            <div>
              <p className="note">아직 스팟이 없어요. 오른쪽 채팅으로 채워 보세요.</p>
            </div>
          </li>
        ) : (
          day.places.map((p) => (
            <PlaceRow
              key={p.id || p.order}
              place={p}
              onFocus={() => onFocusPlace(p.id || String(p.order))}
            />
          ))
        )}
      </ul>
      {day.tips && day.tips.length > 0 ? (
        <div className="tips">
          <strong>팁</strong>
          <ul>
            {day.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {day.google_maps_directions ? (
        <a className="btn ghost block" href={day.google_maps_directions} target="_blank" rel="noreferrer">
          오늘 구글맵 동선
        </a>
      ) : null}
    </article>
  )
}

export function ItineraryPanel({
  itinerary,
  dayId,
  onSelectDay,
  onFocusPlace,
  userLabel,
  onSignOut,
}: Props) {
  const day = itinerary.days_plan.find((d) => d.id === dayId) || itinerary.days_plan[0]
  const stay = itinerary.stay

  return (
    <aside className="panel itinerary-panel">
      <header className="panel-head">
        <div className="panel-head-row">
          <p className="eyebrow">
            {itinerary.city} · {itinerary.nights}N/{itinerary.days}D
          </p>
          {userLabel ? <span className="user-chip">{userLabel}</span> : null}
        </div>
        <h1 className="brand">{itinerary.title}</h1>
        <p className="lede">{itinerary.share?.note || '일정 패널'}</p>
        {onSignOut ? (
          <button type="button" className="btn ghost signout" onClick={onSignOut}>
            로그아웃
          </button>
        ) : null}
        {stay ? (
          <div className="stay">
            <strong>
              {stay.name} <span className="badge lock">고정</span>
            </strong>
            <p>{stay.address || stay.note}</p>
          </div>
        ) : null}
      </header>
      <nav className="day-tabs">
        {itinerary.days_plan.map((d) => (
          <button
            key={d.id}
            type="button"
            className={d.id === day?.id ? 'active' : ''}
            onClick={() => onSelectDay(d.id)}
          >
            {d.label.replace('Day ', 'D').split(' · ')[0]}
          </button>
        ))}
      </nav>
      <div className="day-body">{day ? <DayBody day={day} onFocusPlace={onFocusPlace} /> : null}</div>
    </aside>
  )
}
