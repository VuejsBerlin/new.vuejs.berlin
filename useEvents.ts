import { data as events } from './events.data'

export type Event = typeof events[number] & { cancelled: boolean }

function happensBefore(date: Date, eventDate: Date) {
  return eventDate.getTime() < date.getTime()
}

function isCancelled(url: string) {
  return url.includes('.cancelled')
}

export default function useEvents() {
  const tagged = events.map(e => ({
    ...e,
    cancelled: isCancelled(e.url)
  }))

  tagged.sort((a, b) => a.frontmatter.date.localeCompare(b.frontmatter.date))

  let nextEvent: Event | undefined = undefined
  const pastEvents: Event[] = []
  const futureEvents: Event[] = []
  const cancelledEvents: Event[] = []

  const today = new Date()

  for (const event of tagged) {
    if (event.cancelled) {
      cancelledEvents.push(event)
      continue
    }
    const eventDate = new Date(event.frontmatter.date)
    if (happensBefore(today, eventDate)) {
      pastEvents.push(event)
    } else {
      if (futureEvents.length === 0) nextEvent = event
      futureEvents.push(event)
    }
  }

  return { nextEvent, pastEvents, futureEvents, cancelledEvents, isCancelled }
}
