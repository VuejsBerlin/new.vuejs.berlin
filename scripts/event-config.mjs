// Shared configuration for the OpenMeet event tooling.
// Edit this when the venue, schedule or API details change.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// VitePress serves this directory at the site root, so `public/events/foo.png`
// is reachable as `/events/foo.png`. Root-relative `hero:` values in frontmatter
// point here and are the ones we can upload to OpenMeet; absolute http(s)
// `hero:` values (Luma's CDN) are display-only.
export const PUBLIC_DIR = join(ROOT, 'public')

// Where the cover images actually live, i.e. the files behind `hero: /events/…`.
export const EVENT_IMAGES_DIR = join(PUBLIC_DIR, 'events')

export const OPENMEET = {
  // Overridable so the tooling can be pointed at a dev instance or a local stub.
  api: process.env.OPENMEET_API ?? 'https://api.openmeet.net',
  platform: process.env.OPENMEET_PLATFORM ?? 'https://platform.openmeet.net',
  // The only genuinely opaque value we depend on. OpenMeet is multi-tenant and
  // offers no API to look up your own tenant id, so it is hardcoded. Every
  // request (including login) fails with 401 without it.
  tenant: 'lsdfaopkljdfs',
  // The group's numeric id is resolved from this slug at runtime rather than
  // hardcoded, so recreating the group doesn't silently break the sync.
  groupSlug: 'vuejs-berlin'
}

export const LUMA = {
  calendarUrl: 'https://lu.ma/vuejs_berlin'
}

// Our host. Coordinates are Wikimedia Deutschland, Tempelhofer Ufer 23-24.
export const VENUE = {
  name: 'Wikimedia Deutschland e.V.',
  address: 'Tempelhofer Ufer 23-24, 10963 Berlin',
  lat: 52.4984142,
  lon: 13.3810482
}

export const SCHEDULE = {
  timeZone: 'Europe/Berlin',
  // Frontmatter dates carry this local time; OpenMeet wants UTC instants.
  startTime: '19:00',
  endTime: '22:00',
  durationHours: 3
}

export const DEFAULTS = {
  type: 'in-person',
  maxAttendees: 50,
  categories: [1], // Technology
  visibility: 'public',
  status: 'published',
  allowWaitlist: true,
  requireApproval: false,
  // Public meetup: newcomers must be able to RSVP without joining the group first.
  requireGroupMembership: false,
  sourceType: 'web'
}

export function requiredEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill in your OpenMeet bot credentials.`
    )
  }
  return value
}
