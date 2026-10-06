// Naming and content conventions for event files, kept separate from the CLI so
// they can be tested directly.
//
// Two different conventions are in play, and conflating them is an easy mistake:
//
//   file name   2026-11-vuejs-berlin-hackntell.md   (year + month, no day)
//   slug        2026-11-10-vuejs-berlin             (full date)
//
// File names have dropped the day since 2025; the slug keeps it so the event URL
// stays unambiguous. Older files (e.g. 2017-02-21-vue-meetup.md) use the day in
// both.

import { readdir } from 'node:fs/promises'

// Editions we know how to write. Every third meetup is a Hack'n'Tell.
export const EDITIONS = {
  hackntell: {
    titleSuffix: " - Hack'n'Tell Edition",
    intro: `## Hack'n'Tell 💻

In this format, people share and discuss their projects in a loose, informal round; exchanging ideas, asking questions, and maybe even writing some code together. It's meant as a counterbalance to the otherwise (usually) more formal talks. Not everyone has the time, the slides, or the nerve to prepare a full presentation. This round is for you!

Please use [the chat](https://chat.vuejs.berlin/) to organize, discuss and hype yourself.`
  }
}

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif']

/**
 * `2026-11` → `2026-11-vuejs-berlin.md`, or with an edition
 * `2026-11-vuejs-berlin-hackntell.md`.
 */
export function eventFileName(yearMonth, edition) {
  const suffix = edition ? `-${edition}` : ''
  return `${yearMonth}-vuejs-berlin${suffix}.md`
}

/** The full-date slug, which intentionally does not match the file name. */
export function eventSlug(iso) {
  return `${iso}-vuejs-berlin`
}

export function eventTitle(number, edition) {
  return `Vue.js // Berlin #${number}${EDITIONS[edition]?.titleSuffix ?? ''}`
}

/**
 * Look for a cover image matching this meetup, so a generated file picks up a
 * `hero:` without anyone wiring it up by hand.
 *
 * Matches `<year-month>-vuejs-berlin.<ext>` for a regular meetup and
 * `<year-month>-vuejs-berlin-<edition>.<ext>` for a special edition. Returns
 * `{ hero, edition }`, where `edition` is inferred from the file name.
 */
export async function findCoverImage(imagesDir, yearMonth) {
  let files
  try {
    files = await readdir(imagesDir)
  } catch {
    return { hero: undefined, edition: undefined }
  }

  const stem = `${yearMonth}-vuejs-berlin`
  const exact = IMAGE_EXTENSIONS.map(ext => `${stem}${ext}`).find(name => files.includes(name))
  if (exact) return { hero: `/events/${exact}`, edition: undefined }

  const editionFile = files.find(name => {
    if (!name.startsWith(`${stem}-`)) return false
    return IMAGE_EXTENSIONS.some(ext => name.endsWith(ext))
  })

  if (editionFile) {
    const extension = IMAGE_EXTENSIONS.find(ext => editionFile.endsWith(ext))
    const edition = editionFile.slice(stem.length + 1, editionFile.length - extension.length)
    return { hero: `/events/${editionFile}`, edition }
  }

  return { hero: undefined, edition: undefined }
}

export function eventBody(edition) {
  const intro = edition ? EDITIONS[edition]?.intro : undefined
  return `Let's talk about Vue.js, its ecosystem and your own projects!
${intro ? `\n${intro}\n` : ''}
## Swag'n'Goodies 😎

Grab water, cold drinks, tea or coffee! You can also bring alkoholic beverages and food to the meetup.

## Code of Conduct 🫶

We follow the Berlin Code Of Conduct and expect every attendee to do the same. More details can be found on [berlincodeofconduct.org](http://berlincodeofconduct.org).

## Our Host: Wikimedia e.V. 📚

Wikimedia Deutschland e.V. is kindly offering their event space, time and resources, to make our Meetup possible.
`
}