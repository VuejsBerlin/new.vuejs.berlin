// Sync events/*.md to OpenMeet.
//
//   pnpm event:sync            create/update/cancel as needed
//   pnpm event:sync --dry-run  print the plan and touch nothing
//
// events/*.md is the source of truth. The openmeet_url frontmatter field records
// which OpenMeet event a file maps to; the script writes it on first create and
// reads it back on every later run.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OpenMeetClient, eventUrl } from './openmeet-client.mjs'
import { readEventFiles, readEvent, isCancelled } from './events-lib.mjs'
import { startInstant, statedOffsetIsWrong } from './datetime.mjs'
import { LUMA, VENUE, SCHEDULE, DEFAULTS, PUBLIC_DIR } from './event-config.mjs'

const dryRun = process.argv.includes('--dry-run')

// Stand-in for a file id during a dry run.
const DRY_RUN_UPLOAD = 'dry-run-upload'

// OpenMeet's upload endpoint only accepts these extensions (a regex in
// `FilesS3PresignedService.create`). Notably webp and avif are rejected, so we
// fail locally with a clear message instead of burning an API call.
const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif'
}

function contentTypeFor(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return CONTENT_TYPES[ext] ?? null
}

/**
 * Resolve a frontmatter `hero` to a local file inside `public/`.
 *
 * Root-relative values (`/events/foo.png`) are ours: VitePress serves `public/`
 * at the site root, so the path is stable and the file can be uploaded to
 * OpenMeet. Absolute http(s) values (Luma's CDN) are display-only — we can't
 * upload them without first downloading and re-hosting them.
 */
function resolveLocalHero(hero) {
  if (!hero || !hero.startsWith('/')) return null
  return join(PUBLIC_DIR, hero.replace(/^\/+/, ''))
}

/**
 * Decide whether this event's hero image needs uploading.
 *
 * OpenMeet has no server-side dedupe, so every upload inserts a new file row.
 * We record the sha256 of the file we last uploaded in `hero_sha256` and only
 * re-upload when the local file actually changed. Without that, re-running the
 * sync would pile up duplicate copies.
 *
 * Returns `{ image, sha256 }`, where `image` is the uploaded file id (uploaded
 * during this run) or undefined when nothing needs doing.
 */
async function planHero(event, { isCreate, client, dryRun }) {
  const hero = event.frontmatter.hero
  if (!hero) return {}

  const localPath = resolveLocalHero(hero)
  if (!localPath) {
    // An absolute URL — Luma's CDN. Display-only; we won't re-host someone's
    // image behind their back.
    return {}
  }

  let bytes
  try {
    bytes = await readFile(localPath)
  } catch {
    throw new Error(
      `${event.fileName}: hero points at ${hero} but ${localPath} does not exist. ` +
        `Put the file in public/, or use an absolute URL if it is hosted elsewhere.`
    )
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const filename = localPath.slice(localPath.lastIndexOf('/') + 1)

  const mimeType = contentTypeFor(filename)
  if (!mimeType) {
    throw new Error(
      `${event.fileName}: OpenMeet only accepts ${Object.keys(CONTENT_TYPES).join(', ')} ` +
        `cover images, but ${filename} is not one of them. Convert it first.`
    )
  }

  // On create we always attach it, even if the hash is recorded, because the
  // remote event is new and cannot already carry the image.
  if (!isCreate && event.frontmatter.hero_sha256 === sha256) return {}

  // `image` is only ever used as a truthy flag ("this run needs an upload") and
  // as the id sent in the payload. A dry run must still report the pending
  // upload, so use a truthy sentinel rather than something falsy.
  if (dryRun) return { sha256, image: DRY_RUN_UPLOAD }

  const id = await client.uploadFile(bytes, filename, mimeType)
  return { sha256, image: id }
}

function buildPayload(event, groupId) {
  const { frontmatter, body } = event
  const start = startInstant(frontmatter.date, SCHEDULE.startTime)
  const end = new Date(start.getTime() + SCHEDULE.durationHours * 3_600_000)

  return {
    name: frontmatter.title,
    description: body.trim(),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    timeZone: SCHEDULE.timeZone,
    type: DEFAULTS.type,
    location: `${VENUE.name}, ${VENUE.address}`,
    lat: VENUE.lat,
    lon: VENUE.lon,
    maxAttendees: DEFAULTS.maxAttendees,
    categories: DEFAULTS.categories,
    visibility: DEFAULTS.visibility,
    requireApproval: DEFAULTS.requireApproval,
    requireGroupMembership: DEFAULTS.requireGroupMembership,
    allowWaitlist: DEFAULTS.allowWaitlist,
    // Omitted only in a credential-less dry run, which never sends anything.
    ...(groupId ? { group: { id: groupId } } : {}),
    sourceType: DEFAULTS.sourceType,
    sourceUrl: frontmatter.luma_url ?? LUMA.calendarUrl,
    status: isCancelled(event.fileName) ? 'cancelled' : DEFAULTS.status
  }
}

// The subset of fields that describes the meetup itself. Venue, capacity and
// visibility are OpenMeet-side settings we leave alone once created — only what
// the markdown owns gets compared and pushed.
function comparableFields(event, groupId) {
  const payload = buildPayload(event, groupId)
  return {
    name: payload.name,
    description: normalize(payload.description),
    startDate: payload.startDate,
    endDate: payload.endDate,
    status: payload.status
  }
}

// OpenMeet round-trips the description through its own renderer, so compare on
// whitespace-collapsed text. Without this the sync would rewrite every event on
// every run and never reach "unchanged".
function normalize(text) {
  return (text ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function sameAsRemote(local, remote) {
  return (
    local.name === remote.name &&
    local.description === normalize(remote.description) &&
    local.startDate === new Date(remote.startDate).toISOString() &&
    local.endDate === new Date(remote.endDate).toISOString() &&
    local.status === remote.status
  )
}

/**
 * Set or replace frontmatter keys in an event file, leaving the body untouched.
 * Returns true if anything was written. Keeps the in-memory copy in step so a
 * second call in the same run doesn't rewrite the file again.
 */
async function setFrontmatter(event, updates) {
  let raw = await readFile(event.path, 'utf8')
  let changed = false

  for (const [key, value] of Object.entries(updates)) {
    if (event.frontmatter[key] === value) continue

    const line = `${key}: ${value}`
    const existing = new RegExp(`^${key}:.*$`, 'm')
    if (existing.test(raw)) {
      raw = raw.replace(existing, line)
    } else {
      raw = raw.replace(/^(---\r?\n[\s\S]*?)(\r?\n---)/, `$1\n${line}$2`)
    }
    event.frontmatter[key] = value
    changed = true
  }

  if (changed) await writeFile(event.path, raw)
  return changed
}

async function main() {
  const events = await Promise.all((await readEventFiles()).map(readEvent))

  // A dry run without credentials is still useful: it tells you what would be
  // created, assuming nothing exists yet on OpenMeet. In that mode we can't
  // resolve the group either, so the payload just omits it.
  const hasCredentials = Boolean(process.env.OPENMEET_EMAIL && process.env.OPENMEET_PASSWORD)
  const client = dryRun && !hasCredentials ? null : new OpenMeetClient()

  if (!client) {
    console.log('No OPENMEET_EMAIL/OPENMEET_PASSWORD set — previewing against an empty OpenMeet.')
  }

  const remote = client ? await client.listGroupEvents() : []
  const remoteBySlug = new Map(remote.map(e => [e.slug, e]))
  const groupId = client ? await client.groupId() : undefined

  const stats = { created: 0, updated: 0, cancelled: 0, unchanged: 0 }
  const notes = []
  const offsets = []
  const today = new Date().toISOString().slice(0, 10)

  for (const event of events) {
    const date = (event.frontmatter.date ?? '').slice(0, 10)
    // Only manage events that haven't happened yet. The group's existing
    // back-catalogue is hand-made and stays as it is.
    if (!date || date < today) continue

    if (statedOffsetIsWrong(event.frontmatter.date, SCHEDULE.startTime)) {
      offsets.push(
        `${event.fileName} — date says ${event.frontmatter.date.slice(11)}, ` +
          `but 19:00 Europe/Berlin is ${startInstant(event.frontmatter.date, SCHEDULE.startTime).toISOString()}`
      )
    }

    const slug = event.frontmatter.openmeet_url?.split('/').pop()
    const existing = slug ? remoteBySlug.get(slug) : undefined
    const payload = buildPayload(event, groupId)
    const wantCancelled = payload.status === 'cancelled'

    // Work out the hero image before deciding what changed, so an image-only
    // edit still counts as an update.
    const hero = await planHero(event, { isCreate: !existing, client, dryRun })

    if (!existing && wantCancelled) {
      notes.push(`skip  ${event.fileName} — cancelled but never created on OpenMeet`)
      continue
    }

    if (!existing) {
      stats.created++
      notes.push(`create ${event.fileName} → ${payload.name} (${date})`)
      if (dryRun) continue
      const created = await client.createEvent(
        hero.image ? { ...payload, image: { id: hero.image } } : payload
      )
      const newSlug = created?.slug ?? created?.data?.slug
      if (!newSlug) throw new Error(`OpenMeet did not return a slug for ${event.fileName}`)
      await setFrontmatter(event, {
        openmeet_url: eventUrl(newSlug),
        ...(hero.sha256 ? { hero_sha256: hero.sha256 } : {})
      })
      continue
    }

    // An already-cancelled remote event stays cancelled, whatever the markdown
    // says — no reason to rewrite its description on every run.
    if (wantCancelled && existing.status === 'cancelled') {
      stats.unchanged++
      continue
    }

    // An image-only edit is still an update, so the "unchanged" shortcut has to
    // account for a pending upload.
    if (sameAsRemote(comparableFields(event, groupId), existing) && !hero.image) {
      stats.unchanged++
      continue
    }

    const action = wantCancelled ? 'cancel' : 'update'
    stats[wantCancelled ? 'cancelled' : 'updated']++
    notes.push(
      `${action} ${event.fileName} → ${slug} (${date})` + (hero.image ? ' + image' : '')
    )
    if (dryRun) continue
    await client.patchEvent(slug, {
      name: payload.name,
      description: payload.description,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status,
      ...(hero.image ? { image: { id: hero.image } } : {}),
      ...(event.frontmatter.notice && wantCancelled
        ? { description: `${payload.description}\n\n${event.frontmatter.notice}` }
        : {})
    })
    if (hero.sha256) await setFrontmatter(event, { hero_sha256: hero.sha256 })
  }

  if (offsets.length) {
    console.log(
      `\nNote: ${offsets.length} event file(s) have a UTC offset that doesn't match\n` +
        `Europe/Berlin. OpenMeet was scheduled at 19:00 Berlin regardless:\n` +
        offsets.map(o => `  ${o}`).join('\n')
    )
  }

  console.log(notes.length ? `\n${notes.join('\n')}\n` : '')
  console.log(
    `OpenMeet sync${dryRun ? ' (dry run)' : ''}: ${stats.created} created, ` +
      `${stats.updated} updated, ${stats.cancelled} cancelled, ${stats.unchanged} unchanged.`
  )
}

main().catch(error => {
  console.error(`\n${error.message}`)
  process.exit(1)
})
