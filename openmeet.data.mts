import { defineLoader } from 'vitepress'

// Upcoming events from OpenMeet, fetched at build time so the page needs no
// runtime API call — the same principle the rest of the site follows.
//
// A failure here must never break the build: on error we return an empty list
// and the component falls back to the Luma link.

const API =
  process.env.OPENMEET_API ??
  'https://api.openmeet.net/api/embed/groups/vuejs-berlin/events?limit=5'
const TENANT = 'lsdfaopkljdfs'

export interface OpenMeetEvent {
  slug: string
  name: string
  startDate: string
  timeZone: string
  location: string | null
  url: string
  attendeesCount: number
}

export async function fetchEvents(): Promise<OpenMeetEvent[]> {
  const res = await fetch(API, { headers: { 'X-Tenant-ID': TENANT } })
  if (!res.ok) throw new Error(`OpenMeet responded ${res.status}`)

  const body = await res.json()
  return body?.events ?? []
}

// IMPORTANT: `load()` must return the data itself, not a `{ data }` wrapper.
// VitePress serialises whatever this returns straight into `export const data`,
// which is why `createContentLoader` returns a bare array. Returning
// `{ data: [...] }` makes the component receive an object, so `events.length`
// is `undefined` and the list silently never renders.
export default defineLoader({
  async load(): Promise<OpenMeetEvent[]> {
    try {
      return await fetchEvents()
    } catch (error) {
      console.warn(`[openmeet] Could not load upcoming events: ${(error as Error).message}`)
      return []
    }
  }
})