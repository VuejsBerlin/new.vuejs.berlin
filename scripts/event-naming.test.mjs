// Naming conventions for event files. Run: node --test scripts/event-naming.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  eventFileName,
  eventSlug,
  eventTitle,
  eventBody,
  findCoverImage
} from './event-naming.mjs'

test('file names use year and month, without the day', () => {
  // Regression guard: this used to emit `2026-10-13-vuejs-berlin.md`.
  assert.equal(eventFileName('2026-10'), '2026-10-vuejs-berlin.md')
  assert.equal(eventFileName('2026-11', 'hackntell'), '2026-11-vuejs-berlin-hackntell.md')
})

test('the slug keeps the day, unlike the file name', () => {
  assert.equal(eventSlug('2026-10-13'), '2026-10-13-vuejs-berlin')
  assert.equal(eventFileName('2026-10').replace(/\.md$/, ''), '2026-10-vuejs-berlin')
  // Deliberately different — don't "fix" one to match the other.
  assert.notEqual(eventSlug('2026-10-13'), eventFileName('2026-10').replace(/\.md$/, ''))
})

test('titles follow the existing format, with an edition suffix', () => {
  assert.equal(eventTitle(113), 'Vue.js // Berlin #113')
  assert.equal(eventTitle(112, 'hackntell'), "Vue.js // Berlin #112 - Hack'n'Tell Edition")
})

test('the body leads with the standard intro, then the edition section', () => {
  const regular = eventBody()
  assert.ok(regular.startsWith("Let's talk about Vue.js, its ecosystem and your own projects!"))
  assert.ok(!regular.includes('Hack'))

  const hackntell = eventBody('hackntell')
  assert.ok(hackntell.startsWith("Let's talk about Vue.js, its ecosystem and your own projects!"))
  assert.ok(hackntell.includes("## Hack'n'Tell"))
  // The intro must come before the edition blurb, and swag last.
  assert.ok(hackntell.indexOf('Let\'s talk') < hackntell.indexOf("## Hack'n'Tell"))
  assert.ok(hackntell.indexOf("## Hack'n'Tell") < hackntell.indexOf('## Swag'))
})

async function withImages(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'vuejs-images-'))
  for (const name of files) await writeFile(join(dir, name), 'x')
  try {
    return await run(dir)
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(dir, { recursive: true, force: true })
  }
}

test('a plain cover image is picked up as hero', async () => {
  await withImages(['2026-10-vuejs-berlin.png', '2026-11-vuejs-berlin-hackntell.png'], async dir => {
    const regular = await findCoverImage(dir, '2026-10')
    assert.equal(regular.hero, '/events/2026-10-vuejs-berlin.png')
    assert.equal(regular.edition, undefined)

    // An edition suffix in the image name selects the special edition.
    const special = await findCoverImage(dir, '2026-11')
    assert.equal(special.hero, '/events/2026-11-vuejs-berlin-hackntell.png')
    assert.equal(special.edition, 'hackntell')
  })
})

test('other image extensions are recognised', async () => {
  await withImages(['2026-12-vuejs-berlin.webp'], async dir => {
    assert.equal((await findCoverImage(dir, '2026-12')).hero, '/events/2026-12-vuejs-berlin.webp')
  })
})

test('a month with no cover image yields neither hero nor edition', async () => {
  await withImages(['2026-10-vuejs-berlin.png'], async dir => {
    assert.deepEqual(await findCoverImage(dir, '2027-04'), {
      hero: undefined,
      edition: undefined
    })
  })
})

test('a missing images directory is not an error', async () => {
  assert.deepEqual(await findCoverImage('/definitely/not/here', '2026-10'), {
    hero: undefined,
    edition: undefined
  })
})

test('an edition image does not satisfy a different month', async () => {
  await withImages(['2026-11-vuejs-berlin-hackntell.png'], async dir => {
    assert.deepEqual(await findCoverImage(dir, '2026-12'), {
      hero: undefined,
      edition: undefined
    })
  })
})