// Event times are "19:00 in the room", i.e. 19:00 Europe/Berlin on the meetup's
// calendar date. We derive the UTC instant from that, rather than trusting the
// offset written in frontmatter: several existing files carry the wrong offset
// (+01:00 for a summer month, or vice versa), and silently honouring it would
// schedule the event an hour off.

export const TIME_ZONE = 'Europe/Berlin'

// Offset in minutes east of UTC for Europe/Berlin at the given instant.
function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instant)

  const get = type => Number(parts.find(p => p.type === type).value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - instant.getTime()
}

/**
 * The UTC instant of `hh:mm` local time in `timeZone` on the given calendar date.
 */
export function zonedToUtc(y, m, d, hh, mm, timeZone = TIME_ZONE) {
  // Start from the naive reading, then correct for the offset in effect. Two
  // passes handle the DST-boundary cases where the first guess lands on the
  // wrong side of the transition.
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  for (let i = 0; i < 2; i++) {
    const offset = zoneOffsetMs(guess, timeZone)
    const corrected = new Date(Date.UTC(y, m - 1, d, hh, mm) - offset)
    if (corrected.getTime() === guess.getTime()) break
    guess = corrected
  }
  return guess
}

/**
 * The meetup start instant for an event's frontmatter date string.
 */
export function startInstant(dateStr, startTime, timeZone = TIME_ZONE) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  const [hh, mm] = startTime.split(':').map(Number)
  return zonedToUtc(y, m, d, hh, mm, timeZone)
}

/**
 * Whether the offset written in a frontmatter date matches the real offset for
 * Europe/Berlin on that date. Used to surface stale data, never to schedule.
 */
export function statedOffsetIsWrong(dateStr, startTime, timeZone = TIME_ZONE) {
  const stated = dateStr.match(/([+-])(\d{2}):(\d{2})$/)
  if (!stated) return true
  const statedMinutes =
    (stated[1] === '-' ? -1 : 1) * (Number(stated[2]) * 60 + Number(stated[3]))
  // zoneOffsetMs is minutes east of UTC, which is exactly the convention the
  // ISO offset suffix uses.
  const actualMinutes = zoneOffsetMs(startInstant(dateStr, startTime, timeZone), timeZone) / 60_000
  return statedMinutes !== actualMinutes
}
