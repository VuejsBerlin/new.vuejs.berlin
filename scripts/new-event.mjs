// Scaffold the next event file.
//
//   pnpm event:new                        the next meetup (second Tuesday)
//   pnpm event:new 2026-11-10             for a specific date
//   pnpm event:new 2026-11-10 hackntell   as a special edition
//
// The date defaults to the next second Tuesday (the meetup's long-standing
// schedule) and the number to one past the highest in the repo. The file is not
// pushed anywhere — edit it, then run `pnpm event:sync`.
//
// If a matching cover image already exists in `public/events/`, it is picked up
// as `hero:`, and a `-<edition>` suffix in the image name also selects a special
// edition. So dropping `2026-11-vuejs-berlin-hackntell.png` in place is enough
// to get a Hack'n'Tell file.

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  readEventFiles,
  readEvent,
  secondTuesday,
  highestMeetupNumber,
  EVENTS_DIR
} from './events-lib.mjs'
import { VENUE, EVENT_IMAGES_DIR } from './event-config.mjs'
import {
  EDITIONS,
  eventFileName,
  eventSlug,
  eventTitle,
  eventBody,
  findCoverImage
} from './event-naming.mjs'

function nextSecondTuesday() {
  const now = new Date()
  let date = secondTuesday(now.getFullYear(), now.getMonth())
  if (date.getTime() <= now.getTime()) {
    date = secondTuesday(now.getFullYear(), now.getMonth() + 1)
  }
  return date
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// Berlin is UTC+1 in winter and UTC+2 in summer. Get the offset for this
// particular date rather than hardcoding either.
function offsetFor(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  const sign = local.getTimezoneOffset() > 0 ? '-' : '+'
  const abs = Math.abs(local.getTimezoneOffset())
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

async function main() {
  const [dateArg, editionArg] = process.argv.slice(2)
  const date = dateArg ? new Date(`${dateArg}T12:00:00`) : nextSecondTuesday()

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Could not read "${dateArg}". Expected a date like 2026-11-10.`)
  }

  const year = date.getFullYear()
  const yearMonth = `${year}-${pad(date.getMonth() + 1)}`
  const iso = `${yearMonth}-${pad(date.getDate())}`

  const events = await Promise.all((await readEventFiles()).map(readEvent))
  const number = highestMeetupNumber(events) + 1

  // An explicit edition wins; otherwise infer it from the cover image name.
  const cover = await findCoverImage(EVENT_IMAGES_DIR, yearMonth)
  const edition = editionArg ?? cover.edition

  if (edition && !EDITIONS[edition]) {
    throw new Error(
      `Unknown edition "${edition}". Known editions: ${Object.keys(EDITIONS).join(', ')}.\n` +
        `Add it to EDITIONS in scripts/event-naming.mjs, or omit the argument for a regular meetup.`
    )
  }

  const fileName = eventFileName(yearMonth, edition)
  const path = join(EVENTS_DIR, fileName)
  if (existsSync(path)) throw new Error(`${fileName} already exists.`)

  const frontmatter = [
    '---',
    `title: "${eventTitle(number, edition)}"`,
    `date: ${iso}T19:00:00${offsetFor(date)}`,
    `slug: ${eventSlug(iso)}`,
    ...(cover.hero ? [`hero: ${cover.hero}`] : []),
    '---',
    ''
  ].join('\n')

  await writeFile(path, frontmatter + eventBody(edition))

  console.log(`Created ${fileName}`)
  console.log(`  ${eventTitle(number, edition)} — ${iso}`)
  console.log(`  Venue: ${VENUE.name}, ${VENUE.address}`)
  if (cover.hero) console.log(`  Cover: ${cover.hero}`)
  else console.log('  Cover: none found in public/events/ — add one, or set hero: yourself')
  if (!editionArg && cover.edition) {
    console.log(`  Edition "${cover.edition}" inferred from the cover image name`)
  }
  console.log(`\nNext: add luma_url once the Luma event exists, then run \`pnpm event:sync\`.`)
}

main().catch(error => {
  console.error(`\n${error.message}`)
  process.exit(1)
})